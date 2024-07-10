const { Telegraf, Markup } = require('telegraf')
const { message } = require('telegraf/filters')

const bot = new Telegraf('7231545785:AAEGRwuRsnEr6Eb8hpMEZ55cTI-Ve3xBTs4')

// imoport 
const knex = require('./config/db')

// redis
const redis = require('redis');
const client = redis.createClient();
client.connect();

bot.start(async(ctx) => {
    const firstName = ctx.chat.first_name
    const chatId = ctx.chat.id
    const invited_id = ctx.payload

    if(invited_id.length){
        const room = await knex('rooms').where({'id': invited_id, 'status': 'pending'}).first()
        const roomMemberCount = await knex('room_member').where('room_id', room.id)

        if(room){
            if(roomMemberCount.length < room.member_count){
                const newMmeber = await knex('room_member').insert({ 'room_id': invited_id, 'member_id': chatId, 'member_name': firstName, 'member_number': (roomMemberCount.length +1) })

                ctx.reply("با موفقیت به اتاق بازی اضافه شدید. \n منتظر بمون تا گاد بازی؛ بازی رو استارت کنه..\n\n وقتی بازی شروع شد یه دقیقه زودتر بهت پیام میدم")

                if((roomMemberCount.length+1) == room.member_count){
                    ctx.reply('همه پلیر ها اومدن✅🚀', 
                        { 
                            chat_id: room.owner_room ,
                            reply_markup: {
                                inline_keyboard: [
                                    [
                                        { text: "🏁شروع بازی", callback_data: "play_game" }
                                    ]
                                ]
                            }
                        }
                    )
                } else ctx.reply(`کاربری با نام ${firstName} به اتاق اضافه شد. \n\n ظرفیت اتاق: ${room.member_count} \n ظرفیت پر شده: ${(roomMemberCount.length +1)}`, { chat_id: room.owner_room })
            } else ctx.reply("ظرفیت اتاق پر شده!")
        }
        else ctx.reply("لینک دعوت نامعتبر است!")
    } 
    else ctx.reply('به ربات بازی مافیا خوش اومدی!', 
        Markup.inlineKeyboard([
            [
                Markup.button.callback("ساخت اتاق", "create_room")
            ]
        ])
     )
    
})

bot.action('create_room', async (ctx) => {
    const newRoom = await knex('rooms').insert({
        'owner_room' : ctx.chat.id,
        'created_at' : Math.floor(Date.now()  / 1000)
    })

    await client.setEx(`user:${ctx.chat.id}:create_room`, 30, 'member_count')

    ctx.reply('اتاق شما با موفقیت ساخته شد! \n تعداد پلیر هارو وارد کن')
})

bot.action('play_game', async (ctx) => {
    // get chat info
    const chatId = ctx.chat.id

    // get and update room
    const room = await knex('rooms').where('owner_room', chatId).orderBy('id', 'DESC').first()
    await knex('rooms').where('id', room.id).update({ 'status': 'started' })

    // set roles
    const totalCount = room.member_count 
    const mafiaCount = room.mafia_count 

    let roles = []

    for(i = 0; i < mafiaCount; i++) roles.push("mafia")
    for(i = 0; i < (totalCount - mafiaCount); i++) roles.push("shahr")

    // get players 
    const players = await knex('room_member').where('room_id', room.id).select('member_id', 'member_name')

    // started game
    for(const player of players){
        const memberRole = getAndRemoveRole(roles)
        await knex('room_member').where({ 'room_id': room.id, 'member_id': player.member_id }).update({ 'role': memberRole })
        await client.set(`players:${player.member_id}`, room.id)

        ctx.reply(`${player.member_name} عزیز \n بازی شروع شد!🏁` + `\n\n نقش شما در بازی: ${getRoleLable(memberRole)}` + `\n\n نوبت صحبت پلیر شماره 1`, { chat_id: player.member_id })
    }

    // player 1 open
    await client.set(`room:${room.id}:speek`, "1")
    await client.set(`room:${room.id}:total`, room.member_count)

    // controller God
    ctx.reply("بازی شروع شد✅", {
        reply_markup: {
            keyboard: [
                [
                    { text: "نفر بعد ⏭️" }
                ],
                [
                    { text: "شب شدن  🌒" },
                    { text: "روز شدن ☀️" }
                ]
            ]
        }
    })

})

bot.hears("نفر بعد ⏭️", async (ctx) => {
    const chatId  = ctx.chat.id

    const room = await knex('rooms').where({ 'owner_room': chatId, 'status': 'started' }).first()

    if(room){
        const players = await knex('room_member').whereRaw(`room_id = ${room.id}`)

        // player 1 open
        const getSpeekTime = parseInt(await client.get(`room:${room.id}:speek`))
        const totalCount   = parseInt(await client.get(`room:${room.id}:total`))

        await client.set(`room:${room.id}:speek`, (getSpeekTime+1))

        if(!((getSpeekTime+1) > totalCount)){
            for(const player of players){
                ctx.reply(`نوبت صحبت پلیر شماره ${(getSpeekTime+1)}`, { chat_id: player.member_id })
            }
            ctx.reply(`نوبت صحبت پلیر شماره ${(getSpeekTime+1)}`, { chat_id: room.owner_room })
        }else ctx.reply(`همه بازیکن ها صحبت کردن. الان باید شب بشه!`, { chat_id: room.owner_room })
    }
})

bot.hears("شب شدن  🌒", async (ctx) => {
    const chatId  = ctx.chat.id

    const room = await knex('rooms').where({ 'owner_room': chatId, 'status': 'started' }).first()

    if(room){
        const players = await knex('room_member').whereRaw(`room_id = ${room.id}`)

        // player 1 open
        for(const player of players){
            ctx.reply(`شب شد 🌒`, { chat_id: player.member_id })
        }
    }
})

bot.hears("روز شدن ☀️", async (ctx) => {
    const chatId  = ctx.chat.id

    const room = await knex('rooms').where({ 'owner_room': chatId, 'status': 'started' }).first()

    if(room){
        const players = await knex('room_member').whereRaw(`room_id = ${room.id}`)

        await client.set(`room:${room.id}:speek`, 1)

        // player 1 open
        for(const player of players){
            ctx.reply(`روز شد ☀️ \n بازیکن شماره یک میتونه صحبت کنه`, { chat_id: player.member_id })
        }
    }
})

bot.on('message', async (ctx) => {
    const chatId  = ctx.chat.id
    const message = ctx.message.text
    const action  = await client.getSet(`user:${ctx.chat.id}:create_room`, 'mafia_count')

    // have game 
    const playerRoom = await client.get(`players:${chatId}`)

    // setting room
    if(action){
        const memberRoom = await knex('rooms').where('owner_room', chatId).orderBy('id', 'DESC').first()
        if(memberRoom){
            if(action == "member_count"){
                const memberCount = parseInt(message)
                
                const updateRoom = await knex('rooms').update({ 'member_count': memberCount }).where('id', memberRoom.id)
                
                ctx.reply(`ظرفیت اتاق شما : ${memberCount} نفر است. \n حالا تعداد مافیا هارو وارد کن`)
            } 
            else if(action == "mafia_count"){
                const mafiaCount = parseInt(message)
                
                const updateRoom = await knex('rooms').update({ 'mafia_count': mafiaCount }).where('id', memberRoom.id)
                
                ctx.reply('لینک دعوت اتاق ساخته شد 👇')
                ctx.reply(`https://t.me/mafiasabzlearnbot?start=${memberRoom.id}`)
            }
        }
    }

    // message players in game
    if(playerRoom){
        const speekTime    =  await  client.get(`room:${playerRoom}:speek`)
        const totalPLayers =  await  client.get(`room:${playerRoom}:total`)
        const room         =  await  knex('rooms').where('id', playerRoom).first()

        // get players 
        const player  = await knex('room_member').where({ 'room_id': playerRoom, 'member_id': chatId }).first()
        const players = await knex('room_member').whereRaw(`room_id = ${playerRoom} && member_id != ${chatId}`)

        // talking mafia players in night
        if(speekTime > totalPLayers){
            if(player.role == "shahr")
                ctx.reply("شما شهروند هستید و شهروندان توی شب اجازه صحبت ندارند 🌒")
            else if(player.role == "mafia"){
                for(const mafiaPlayer of players){
                    if(mafiaPlayer.role == "mafia"){
                        ctx.reply(`(${player.member_number}) ${player.member_name}: \n${message}`, { chat_id: mafiaPlayer.member_id })
                    }
                }
                ctx.reply(`(${player.member_number}) ${player.member_name}: \n${message}`, { chat_id: room.owner_room })
            }
        }
        else {
            if(speekTime == player.member_number){
                // send for god
                ctx.reply(`(${player.member_number}) ${player.member_name}: \n${message}`, { chat_id: room.owner_room })
    
                // send for players
                for(const otherPlayer of players){
                    ctx.reply(`(${player.member_number}) ${player.member_name}: \n${message}`, { chat_id: otherPlayer.member_id })
                }
            }else ctx.reply("نوبت صحبت شما نیست ❌")
        }
    }

})

// functions
function getAndRemoveRole(roles){
    const indexRole = Math.floor(Math.random() * roles.length)
    const RandomRole = roles[indexRole]

    roles.splice(indexRole, 1)

    return RandomRole
}

function getRoleLable(role){
    if(role == "mafia") return "مافیا 👺";
    else if(role == "shahr") return "شهروند 😇";
}


bot.launch()

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))