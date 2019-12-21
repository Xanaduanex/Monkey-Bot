//Define dependencies
const fs = require("fs");
const Discord = require("discord.js");
const mysql = require("mysql");
const {prefix, token, sqlpass} = require("./config.json");

//Set up client
const client = new Discord.Client();
client.commands = new Discord.Collection();
client.active = new Discord.Collection();
client.login(token);

//Define constants
const DEFAULT_COOLDOWN = 3;
const SECS_TO_MS = 1000;
global.VALID_STATUS = 200;

//Get list of command files
const commandFiles = fs.readdirSync("./commands").filter(file => file.endsWith(".js"));
const cooldowns = new Discord.Collection();

for(const file of commandFiles){
    const command = require(`./commands/${file}`);
    client.commands.set(command.name, command);
}

//Startup message, triggers once upon login
client.once("ready", () => {
    console.log("Ready!");
});

//Connect to MySQL Database
var database = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: sqlpass,
    database: "monkeybot"
});

database.connect((err) => {
    if(err){
        throw err;
    }
    console.log("Connected to Database!");
});

client.on("message", message => {

    //Don't allow bots to run commands
    if(message.author.bot){
        return;
    }

    //Log messages
    fs.appendFile("log.txt", ("[#" + message.channel.name + "] " + message.author.tag + ": " + message + "\n"), (err) => {
        if(err){
            console.log(err);
        }
    });

    const currentActive = client.active.has(message.author.id);

    //Exit early if user is in the middle of a Collector command
    if(currentActive){
        return;
    }

    //Respond to mentions
    if(message.content.match(/<@!?(651523467174346804)>/)){
        client.commands.get("who ping me").execute(message);
    }

    //Respond to no u
    if(message.content.toLowerCase().includes("no u")){
        client.commands.get("no u").execute(message);
    }

    //Only run commands with prefix
    if(!message.content.startsWith(prefix)){
        return;
    }


    console.log(message.content);


    //Slice off prefix, split message by spacebars
    const original = message.content.slice(prefix.length).split(" ");
    const args = message.content.slice(prefix.length).split(/ +/);
    
    //Take first element (command) off
    const commandName = args.shift().toLowerCase(); 
    original.shift();


    const command = client.commands.get(commandName);

    //Exit early if command doesn't exist or can't be run
    if(!command || command.cannotRun){
        return;
    }


    if(!cooldowns.has(command.name)){
        cooldowns.set(command.name, new Discord.Collection());
    }

    const now = Date.now();
    const timestamps = cooldowns.get(command.name);
    //Either set as defined cooldown time or 3 as default (in secs)
    const cooldownTime = (command.cooldown || DEFAULT_COOLDOWN) * SECS_TO_MS; 

    if(timestamps.has(message.author.id)){
        const expireTime = timestamps.get(message.author.id) + cooldownTime;

        if(now < expireTime){
            const timeLeft = (expireTime - now) / SECS_TO_MS;
            return message.reply(`Please wait ${timeLeft.toFixed(1)} more second(s) before reusing \`${prefix}${command.name}\``)
        }
    } else {
        timestamps.set(message.author.id, now);
        //Automatically delete user entry from timestamps after cooldown
        setTimeout(() => timestamps.delete(message.author.id), cooldownTime);
    }

    
    //Run commands
    try{
        if(command.needsOriginal){
            command.execute(message, original, client, database);
        } else if(command.limit_user){
            client.active.set(message.author.id);
            command.execute(message, args, client, database);
        } else {
            
            //Check if command is only available on server text channels
            if(command.guildOnly && message.channel.type !== 'text'){
                return message.reply("Get that command out of my DMs.");
            }

            command.execute(message,args);
        }

    //Handle any errors gracefully
    } catch(error) {
        console.error(error);
        message.reply("Error executing command");
    }
    
});
