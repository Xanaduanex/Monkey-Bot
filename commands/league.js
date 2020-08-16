const riot = require('./modules/module-riot-api.js');
const league = require('./modules/module-league.js');
const general = require('./modules/module-general.js');
const flags = require('./modules/module-flags.js');
const Discord = require('discord.js');
const {LOL_PATCH} = require('../data/config.json');

module.exports = {
    name: 'league',
    async execute(params){

        let mention = await general.getFirstMention(params, general.USER);

        if(!params.args.length || mention){
            databaseLeagueProfile(params, mention);

        } else {
            let userFlags;
            try{
                userFlags = parseFlags(params.args);
            } catch(err){
                params.message.reply(err);
                return;
            }
            
            let region = userFlags.region;
            let username = params.args.join(' ');
            
            if(userFlags.actionType == flags.LEAGUE.LINK){
                linkLeagueProfile(params, region, username);
            } else if(userFlags.actionType == flags.LEAGUE.UNLINK){
                unlinkLeagueProfile(params);
            } else {
                let embed = await leagueProfile(region, username);
                params.message.channel.send(embed);
            }
        }
    }
}

const actions = {
    SEARCH: 'search',
    LINK: 'link',
    UNLINK: 'unlink'
}

function parseFlags(args){

    let result = {
        actionType: actions.SEARCH,
        region: league.DEFAULT_REGION
    }

    let currArg = args[0];
    if(!currArg.startsWith('-')){
        return result;
    }

    let regionFlagValue = flags.getFlagValue(args[0], flags.LEAGUE.REGION);

    if(regionFlagValue){
        if(league.isValidRegionCode(regionFlagValue)){
            result.region = regionFlagValue.toUpperCase();
            args.shift();
        } else {
            throw 'That\'s not a valid region!';
        }
    }

    currArg = args[0];

    if(!currArg){
        throw 'I\'m gonna need a username with that flag...';
    }

    if(currArg == flags.LEAGUE.LINK || currArg == flags.LEAGUE.UNLINK){
        result.actionType = currArg;
        args.shift();
    }

    return result;
}

async function leagueProfile(region, username){
    const regionForURL = region == 'KR' ? '' : `${region.toLowerCase()}.`;
        
    let summonerData, rankedResponse;
    try{
        summonerData = await riot.getSummonerDataByName(region, username);
        rankedResponse = await riot.getRankedInfo(region, summonerData.id);
    } catch (err){
        if(err == riot.ERROR_DNE){
            return `I can\'t find \`${username} (${region})\`. Make sure the username and region is correct.`;
        } else {
            throw err;
        }
    }

    const title = `${summonerData.name} (${region})`;
    const level = `${summonerData.summonerLevel}`;
    const opgg = encodeURI(`https://${regionForURL}op.gg/summoner/userName=${summonerData.name}`);
    const footer = 'Use the -r=XX flag to search different regions!';
    const profileIconPath = `./lol_assets/${LOL_PATCH}/img/profileicon/${summonerData.profileIconId}.png`;
    const profileIcon = new Discord.MessageAttachment(profileIconPath, 'profileIcon.png')

    const rankedData = riot.getRankedData(rankedResponse, riot.SOLO_QUEUE)

    let embed;

    if(rankedData){
        const tier = rankedData.tier[0] + rankedData.tier.slice(1).toLowerCase();
        const rank = `${tier} ${rankedData.rank}, ${rankedData.leaguePoints} LP`
        const wins = `${rankedData.wins}`
        const losses = `${rankedData.losses}`;
        const winRatio = `${(rankedData.wins / (rankedData.wins + rankedData.losses)).toFixed(3) * 100}%`;
        const rankIcon = new Discord.MessageAttachment(`./lol_assets/rank-icons/${tier}-${league.rankToInt(rankedData.rank)}.png`, 'rankIcon.png')

        embed = new Discord.MessageEmbed()
            .setColor('#fffff0')
            .setTitle(title)
            .setURL(opgg)
            .addField('Level', level)
            .addField('Ranked Solo/Duo', rank)
            .addField('Wins', wins, true)
            .addField('Losses', losses, true)
            .addField('Win Ratio', winRatio, true)
            .attachFiles([profileIcon, rankIcon])
            .setImage('attachment://profileIcon.png')
            .setThumbnail('attachment://rankIcon.png')
            .setFooter(footer);


    } else {
        const rankIcon = new Discord.MessageAttachment('./lol_assets/rank-icons/unranked.png', 'rankIcon.png')

        embed = new Discord.MessageEmbed()
            .setColor('#fffff0')
            .setTitle(title)
            .setURL(opgg)
            .addField('Level', level)
            .addField('Ranked Solo/Duo', 'Unranked')
            .attachFiles([profileIcon, rankIcon])
            .setImage('attachment://profileIcon.png')
            .setThumbnail('attachment://rankIcon.png')
            .setFooter(footer); 
    }
    return embed;
}

function databaseLeagueProfile(params, mention){
    let id = mention ? mention.id : params.message.author.id;
    //TODO: Use memory cache
    params.database.query(`SELECT * FROM lol_names WHERE id = ${id};`, async (err, rows) => {
        if(err) throw err;

        if(!rows.length){
            if(mention){
                params.message.channel.send(`${mention.username} hasn't linked their League account!`);
            } else {
                params.message.reply(`You haven't linked your League account! Use \`~league -link YOUR_USERNAME\` to link it.`);
            }
            return;
        }

        let username = rows[0].username;
        let region = rows[0].region;
        let embed = await leagueProfile(region, username);
        params.message.channel.send(embed);
    });
}


function linkLeagueProfile(params, region, username){
    //TODO: Add to client's memory cache
    //TODO: Verify username exists

    params.database.query(`SELECT * FROM lol_names WHERE id = ${params.message.author.id};`, (err, rows) => {
        if(err) throw err;

        if(!rows.length){
            params.database.query(
                `INSERT INTO lol_names (id, username, region) VALUES (?, ?, ?);`,
                [params.message.author.id, username, region]
            );
        } else {
            params.database.query(
                `UPDATE lol_names SET username = ?, region = ? WHERE id = ${params.message.author.id};`,
                [username, region],
            );

        }
        //TODO: Use embed
        params.message.reply(`Your League username has been set to \`${username} (${region})\`!`);
    });
}


function unlinkLeagueProfile(params){
    //TODO: Remove from client's memory cache
    //TODO: Reply with an embed
    params.database.query(`SELECT * FROM lol_names WHERE id = ${params.message.author.id};`, (err, rows) => {
        if(err) throw err;

        if(!rows.length){
            params.message.reply('There\'s nothing to unlink!')
            return;
        }

        params.database.query(`DELETE FROM lol_names WHERE id = ${params.message.author.id};`);
        //TODO: Use embed
        params.message.reply('Your League username has been unlinked!');
    });
}
