const { Telegraf, Markup } = require('telegraf')
const { message } = require('telegraf/filters')

const bot = new Telegraf('7231545785:AAEGRwuRsnEr6Eb8hpMEZ55cTI-Ve3xBTs4')

bot.start((ctx) => {
    ctx.reply('به ربات بازی مافیا خوش اومدی!', 
        Markup.inlineKeyboard([
            [
                Markup.button.callback("ساخت اتاق", "create_room")
            ]
        ])
     )
})


bot.launch()

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))