import { Hex } from 'viem';
import { makeLogger } from '../utils/logger';
import UserAgent from 'user-agents';
import axios from 'axios';
import { capSolverConfig, generalConfig } from '../config';
import { v4 as uuidv4 } from 'uuid';
import { HttpsProxyAgent } from 'https-proxy-agent';

export class CaptchaSolver {
  address: Hex;
  proxyUrl: string = capSolverConfig.proxyUrl;
  logger: any;

  constructor(address: Hex) {
    this.address = address;
    this.logger = makeLogger('Captcha Solver');
  }

  userAgent = new UserAgent();

  successfulRequest: Record<string, string> = {};
  cooldownRequest: Record<string, string> = {};
  errorRequest: Record<string, string> = {};

  getProxyUrlWithNewSession(): string {
    const sessionId = uuidv4().replace(/-/g, '');
    return this.proxyUrl.replace('<sessionId>', sessionId);
  }

  async requestTokens(): Promise<number> {
    const apiKey = capSolverConfig.key;

    if (!apiKey) {
      this.logger.error(
        `${this.address} | CAPSOLVER_KEY is not defined in environment variables`
      );
      return 0;
    }

    const proxyUrlWithSession = this.getProxyUrlWithNewSession();

    const proxyAgent = new HttpsProxyAgent(proxyUrlWithSession);

    const instance = axios.create({
      httpsAgent: proxyAgent,
      proxy: false,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    try {
      const createTaskResponse = await instance.post(
        'https://api.capsolver.com/createTask',
        {
          clientKey: apiKey,
          task: {
            type: 'AntiTurnstileTask',
            websiteURL: 'https://bartio.faucet.berachain.com/',
            websiteKey: '0x4AAAAAAARdAuciFArKhVwt',
            proxy: proxyUrlWithSession,
            userAgent: this.userAgent.random().toString(),
          },
        }
      );

      const captchaTask = createTaskResponse.data;

      let captchaToken: string | undefined = undefined;
      const maxAttempts = 60;
      let attempts = 0;

      while (attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        attempts++;

        const getTaskResultResponse = await instance.post(
          'https://api.capsolver.com/getTaskResult',
          {
            clientKey: apiKey,
            taskId: captchaTask.taskId,
          }
        );
        const captchaSolveStatus = getTaskResultResponse.data;
        if (captchaSolveStatus.status === 'ready') {
          captchaToken = captchaSolveStatus.solution.token;
          break;
        } else if (captchaSolveStatus.status === 'failed') {
          const errorMsg = `Captcha solving failed: ${captchaSolveStatus.errorDescription}`;
          this.errorRequest[this.address] = errorMsg;
          this.logger.error(
            `${this.address} | Captcha solving failed: ${captchaSolveStatus.errorDescription}`
          );
          return 0;
        }
      }

      if (!captchaToken) {
        const errorMsg = 'Captcha solving timed out after maximum attempts';
        this.errorRequest[this.address] = errorMsg;
        this.logger.error(
          `${this.address} | Captcha solving failed: ${errorMsg}`
        );
        return 0;
      }

      try {
        const claimResponse = await instance.post(
          `https://bartio-faucet.berachain-devnet.com/api/claim?address=${this.address}`,
          { address: this.address },
          {
            headers: {
              'User-Agent': this.userAgent.random().toString(),
              Authorization: `Bearer ${captchaToken}`,
            },
          }
        );
        if (claimResponse.status === 200) {
          this.successfulRequest[this.address] = 'Success';
          this.logger.info(
            `${this.address} | Captcha passed successfully, the tokens were sent`
          );
        } else if (claimResponse.status === 429) {
          const infoMsg = 'Wallet in cooldown, try again later';
          this.cooldownRequest[this.address] = infoMsg;
          this.logger.info(
            `${this.address} | Wallet in cooldown, try again later`
          );
        } else if (claimResponse.status === 402) {
          const errorMsg = "Failed request, reason: You don't have 0.001 ETH";
          this.errorRequest[this.address] = errorMsg;
          this.logger.error(
            `${this.address} | Failed request, reason: You don't have 0.001 ETH`
          );
        } else {
          const errorMsg = `Failed request, reason: ${claimResponse.data}`;
          this.errorRequest[this.address] = errorMsg;
          this.logger.error(
            `${this.address} | Failed request, reason: ${claimResponse.data}`
          );
        }
        return claimResponse.status;
      } catch (error) {
        if (axios.isAxiosError(error)) {
          const status = error.response?.status;
          const errorMsg = `Failed request, reason: ${error.message}`;
          this.errorRequest[this.address] = errorMsg;
          if (status === 429) {
            const infoMsg = 'Wallet in cooldown, try again later';
            this.cooldownRequest[this.address] = infoMsg;
            this.logger.info(
              `${this.address} | Wallet in cooldown, try again later`
            );
          } else if (status === 402) {
            const errorMsg = "Failed request, reason: You don't have 0.001 ETH";
            this.errorRequest[this.address] = errorMsg;
            this.logger.error(
              `${this.address} | Failed request, reason: You don't have 0.001 ETH`
            );
          } else {
            this.logger.error(
              `${this.address} | Failed request, reason: ${error.message}`
            );
          }
          return status || 0;
        } else {
          const errorMsg = `Failed request, reason: ${error}`;
          this.errorRequest[this.address] = errorMsg;
          this.logger.error(
            `${this.address} | Failed request, reason: ${error}`
          );
          return 0;
        }
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const data = error.response?.data;
        const errorMsg = `Failed to create captcha task: ${
          error.message
        }, Response: ${JSON.stringify(data)}`;
        this.errorRequest[this.address] = errorMsg;
        this.logger.error(
          `${this.address} | Failed to create captcha task: ${
            error.message
          }, Response: ${JSON.stringify(data)}`
        );
        return status || 0;
      } else {
        const errorMsg = `Failed to create captcha task: ${error}`;
        this.errorRequest[this.address] = errorMsg;
        this.logger.error(
          `${this.address} | Failed to create captcha task for ${this.address}: ${error}`
        );
        return 0;
      }
    }
  }
}
