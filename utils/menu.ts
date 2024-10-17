import inquirer from 'inquirer';

export const entryPoint = async (): Promise<any> => {
  const questions = [
    {
      name: 'choice',
      type: 'list',
      message: 'Choose an action:',
      choices: [
        {
          name: 'Berachain faucet',
          value: 'berachain_faucet',
        },
        {
          name: 'Berps',
          value: 'berps',
        },
      ],
    },
  ];

  const answers = await inquirer.prompt(questions as any);
  return answers.choice;
};
