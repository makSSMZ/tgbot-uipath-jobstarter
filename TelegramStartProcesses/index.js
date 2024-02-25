import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { getToken, startProcess, getProcessID, checkRBTisWorking, getJobStatus, getRobotID } from './orchestratorLib.js'
import { checkUserIsActive } from './inspector.js'

//Just need to create __dirname var
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import dotenv from 'dotenv'
dotenv.config({ path: __dirname + '/.env' })

import { message } from 'telegraf/filters';
import { session, Telegraf } from 'telegraf';
import fs from 'fs';

const bot = new Telegraf(process.env.botApi);
const usersDataFilePath = process.env.joinedUsersPath;
//List of users, which can work with robots
const employeesJson = fs.readFileSync(process.env.allowedRobotsToRunPath);
const employees = JSON.parse(employeesJson);

//List of generals chat ids for rbts to notificate
const generalChatIdsJson = fs.readFileSync(process.env.generalChatIdsForRBTsPath);
const generalChatIds = JSON.parse(generalChatIdsJson);

let orchestratorToken = '';
let user = {
  id: null,
  first_name: null,
  last_name: null,
  username: null
};

//bot.use(session())

bot.start((ctx) => {
  logUser(ctx);
  ctx.reply(`${ctx.message.from.first_name}, добро пожаловать! Для запуска процесса необходимо в главном меню /startproc нажать на "Список роботов" и выбрать нужного робота.`);
})

//Functions to search robots which available to user
function getAvailableRbts(employeesId) {
  let inlineRBTS = [];
  if (employeesId in employees) {
    for (const rbts of employees[employeesId]) {
      inlineRBTS.push({
        "text": rbts,
        "callback_data": `rbt_start_${rbts}`
      })
    }
    return [inlineRBTS]
  }
  else {
    return [[{
      "text": "Нет роботов для запуска",
      "callback_data": `NotExistsRBTS`
    }]]
  }
}

//Functions to get general chat id for rbt
function getGeneralChatIdForRBT(rbtName) {
  if (rbtName in generalChatIds) {
    return generalChatIds[rbtName]
  }
  else {
    return 0
  }
}

//Functions to check if resolved to start rbt to user
function canUserStartRBT(employeesId, rbtName) {
  if (employeesId in employees) {
    return employees[employeesId].includes(rbtName)
  }
  else {
    return false
  }
}

//work with the incoming command from message to start the bot
async function workWithStartRequest(ctx) {

  let regex = new RegExp(process.env.processRegex);
  let processName = ctx.callbackQuery.data.match(regex)[0]

  if (canUserStartRBT(ctx.callbackQuery.message.chat.id, processName)) {
    orchestratorToken = await getToken(orchestratorToken);
    let processId = await getProcessID(processName, orchestratorToken)

    console.log(`Process name to start is ${processName}`)

    let generalChatId = getGeneralChatIdForRBT(processName)
    const processKey = await startProcess(processId, orchestratorToken, processName, ctx, generalChatId);

    if (processKey == 0) {

    } else {
      let counter = 0
      while (counter < 13) {
        await sleep(300000)
        //await sleep(30000)

        let processStatus = await getJobStatus(processKey, orchestratorToken);
        if (processStatus == 'Running') {

        } else if (processStatus == 'Successful') {
          if (generalChatId != 0) {
            ctx.telegram.sendMessage(generalChatId, `Робот ${processName} завершил работу`)
          }
          ctx.telegram.sendMessage(ctx.callbackQuery.message.chat.id, `Робот ${processName} завершил работу`)
          return;
        } else if (processStatus == 'Faulted' || processStatus == 'Stopped') {
          if (generalChatId != 0) {
            ctx.telegram.sendMessage(generalChatId, `Ошибка при работе робота ${processName}!`)
          }
          ctx.telegram.sendMessage(ctx.callbackQuery.message.chat.id, `Ошибка при работе робота ${processName}!`)
          return;
        }

        counter++
      }
    }
  } else {
    ctx.telegram.sendMessage(ctx.callbackQuery.message.chat.id, `Робот ${processName} недоступен для запуска! Необходимо обратиться к администратору.`)
  }

}

//Just wait :)
function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

//Write new user into file
function logUser(ctx) {
  user.id = ctx.from.id;
  user.first_name = ctx.from.first_name;
  user.last_name = ctx.from.last_name;
  user.username = ctx.from.username;

  let usersData = fs.readFileSync(usersDataFilePath)
  let usersParsed = JSON.parse(usersData);
  let loggedUser = usersParsed.find((item) => item.id === user.id);

  if (!loggedUser) {
    //Залогируй юзера если не нет такого ID в БД
    usersParsed = [...usersParsed, { ...user }];
    let usersJsoned = JSON.stringify(usersParsed);
    fs.writeFileSync(usersDataFilePath, usersJsoned)
  } else if (loggedUser.first_name !== user.first_name ||
    //если какие-нибудь данные изменились - запиши как нового пользователя
    loggedUser.last_name !== user.last_name ||
    loggedUser.username !== user.username) {
    usersParsed = [...usersParsed, { ...user }];
    let usersJsoned = JSON.stringify(usersParsed);
    fs.writeFileSync(usersDataFilePath, usersJsoned)
  }
}

//Waiting for callback requset from message
bot.on('callback_query', async (ctx) => {
  if (await checkUserIsActive(ctx.callbackQuery.message.chat.id)) {
    if (ctx.callbackQuery.data.includes('rbt_start_')) {

      workWithStartRequest(ctx);

    } else if (ctx.callbackQuery.data == `StartRobots`) {
      ctx.telegram.sendMessage(ctx.callbackQuery.message.chat.id, 'Выберите робота для запуска:', {
        "reply_markup": {
          "inline_keyboard": getAvailableRbts(ctx.callbackQuery.message.chat.id)
        }
      })
    };
    await ctx.telegram.answerCbQuery(ctx.callbackQuery.id);
  } else {
    ctx.telegram.sendMessage(ctx.callbackQuery.message.chat.id, `Для работы нужно зарегистрироваться у `)
  }
});

//Waitng for text from message
bot.on(message('text'), async (ctx) => {
  if (ctx.chat.id.toString().startsWith('-') == false) {
    if (await checkUserIsActive(ctx.from.id)) {
      if (ctx.message.text == "Список роботов") {
        ctx.telegram.sendMessage(ctx.message.chat.id, 'Выберите робота для запуска:', {
          "reply_markup": {
            "inline_keyboard": getAvailableRbts(ctx.message.chat.id)
          }
        });
      }
      else {
        ctx.telegram.sendMessage(ctx.message.chat.id, "Главное меню", {
          "reply_markup": {
            "inline_keyboard": [[{
              "text": "Список роботов",
              "callback_data": `StartRobots`
            }]]
          }
        });
      }
    } else {
      ctx.telegram.sendMessage(ctx.message.chat.id, `Для работы нужно зарегистрироваться у `)
    }
  }
}
);

bot.launch();

bot.catch((err) => {
  console.log('Error:', err)
})

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

