/*
Title: RP Bot
Description: Posts quest listings for a D&D adventurers guild campaign
Version: 1.2.0
Author: Colonel Rabbit, Duunko
Requires: node, discord.js, fs
*/

//dependencies
const Discord = require("discord.js");
const fs = require('fs');
const path = require('path');
const package = require('./package.json');

//bot token ***DO NOT SHARE***
const token = package.token;

//prefix for bot commands
const prefix = "*";

//create bot user and login
var bot = new Discord.Client();
bot.login(token);

//Channel Consts
const quest_board_token = '399066585240698881';
var quest_board;


//when ready, log in console
bot.on("ready", () => {

    console.log("Ready");
	quest_board = bot.channels.get(quest_board_token);
    //*optional to send notification to specific channel
    //presently set to Bot Test chat
    //message.bot.channels.get('367482251803361291').send("Ready");

});

//when message is posted in a chat, check to see how the bot should respond
bot.on("message", function (message) {

    //if bot sent the message, check to see if it was a quest posting, else return
    if (message.author.equals(bot.user)) {
        return;
    }

    //if message doesn't start with proper prefix, ignore
    if (!message.content.startsWith(prefix)) return;

    

    //seperate message into array based on spaces (get rid of prefix)
    var args = message.content.substring(prefix.length).split(" ");

    //switch statement checks if message contains commands
    switch (args[0].toLowerCase()) {

        //updates status of a quest
        //takes input: "title" new status
        case "update":

            //combines input into a string
            var input = args.splice(1).join(" ");

            //regex seperates title and status
            var regEx = /"(.*)"\w*(.*)/;

            var match;
            if (match = regEx.exec(input)) {
                var title = match[1];
                var status = match[2];
            }
            else {
                message.channel.send("Error, please try again.");
                break
            }

            //try..catch for IO errors
            try {

                //looks for file w/ name of title
                var id = fs.readFileSync(__dirname + '/' + title + ".txt", 'utf8');

                //if quest complete, delete txt file
                if (status.toLowerCase() == "complete") {
                    fs.unlinkSync(__dirname + '/' + title + ".txt");
                }

                //find the message posting, edit to set quest status to new status
                message.channel.fetchMessage(id).then(message => {
                    message.edit("**QUEST STATUS: " + status.toUpperCase() + "**");
                });
            } catch (error) {
                //if error, log error and notify user
                console.log(error);
                message.channel.send("Error, please try again.");
            }

            break;

        //creates a new quest posting
        //takes input of form:
        //"title" TITLE TEXT
        //"header1" TEXT1
        //"header2" TEXT2
        case "quest":
		
		//if message sender isn't a "Quest Giver", ignore
		if (!message.member.roles.some(r => ["Quest Giver"].includes(r.name))) {
        //message.channel.send("You don't have permissions. Go to the brig");
			return;
		}

            //creates embed for quest listing
            var listing = new Discord.RichEmbed().
                setAuthor(message.author.username).
                setThumbnail(message.author.avatarURL);

            //combines input into a single string for regex
            var text = args.splice(1).join(" ");

            //searches for new lines and seperates headers from texts
            var regEx = /^(?:"|“)(.*?)(?:"|”)\w*(.*?)$/gm;
            var match;
            while ((match = regEx.exec(text)) !== null) {
                console.log("ping");
                //if "title" set as title
                if (match[1].toLowerCase() == "title") {
                    listing.setTitle(match[2]);
                }
                //else create a new field for the header+text
                else {
                    try {
                        listing.addField(match[1], match[2], false);
                    } catch (e) {
                        console.log(e);
                        message.channel.send("Error posting quest, check console for details; likely a field exceeded 1024 characters.");
                        return;
                    }
                }
            }

            //if a title wasn't provided, don't post the quest
            if (!listing.title) {
                message.channel.send("Your quest needs a title, please remake the quest.");
                return;
            }

            //send embed w/ quest status text
            message.channel.send("**QUEST STATUS: OPEN**", listing)
                .then((message) => {

                    //after message is sent, bot reads finds message id and stores as txt file
                    console.log(message.id);

                    //grab ID of message, and title of embed
                    var id = message.id;
                    var title = message.embeds[0].title;

                    //create a file with name "title.txt" and content of the quest posting ID
                    fs.writeFileSync(__dirname + '/' + title + ".txt", id);
                });


            break;

        //command to test bot responsiveness, sends a response to the log
        case "test":

            message.channel.send("Ping");
			console.log(message.channel.id);

            break;

        //rolls X dice with Y sides
        //takes input of form: XdY
        case "roll":

            //if no input return
            if (!args[1] == /\dd\d/) {
                message.channel.send("Give a dice value, XdY");
                return;
            }

            //splits input along 'd', converts to ints
            var dice = args[1].split("d");
            dice[0] = parseInt(dice[0]);
            dice[1] = parseInt(dice[1]);

            //creates array for the rolls, performs roll opperations
            var rolls = [];
            for (var i = 0; i < dice[0]; i++) {
                rolls.push(Math.ceil(Math.random() * dice[1]));
            }

            //begins to build output string
            var output = "You rolled " + dice[0] + "d" + dice[1];

            //adds modifiers to roll if input given
            if (/[\+\-]\d+/.exec(args[2])) {
                rolls.push(parseInt(args[2]));
                output += " " + args[2];
            }
            output += " and got ";

            //sums rolls and adds to output
            output += rolls.reduce((x, y) => x + " + " + y) + " = " + rolls.reduce((x, y) => x + y);

            //sends result as a reply to sender
            message.reply(output);

            break;

        //if command doesn't match, notify user and send help list
        default:

            message.channel.send(message.content + " is not a valid command. See the list of commands below: ");

        //creates an embed displaying the list of commands and sends it
        case "help":

            //embed of bot commands
            var commands = new Discord.RichEmbed()
                .setColor([40, 110, 200])
                .setTitle("RPBot Commands:")
                .addField('*quest', '"title" TITLE \n "header1" TEXT1 \n "header2" TEXT2')
                .addField('*update', '"title" new status')
                .addField('*roll XdY (+Z)', "rolls XdY dice with an option for a modifier of +/-Z (don't add parentheses)")
                .setFooter('Make sure all quests have a "title". "title" must be on the same line as the *quest command. When the quest is done, set status to "complete" but it will make it so that quest status cannot be changed any further.')
                .setThumbnail(bot.user.avatarURL);
            message.channel.send(commands);

            break;
			
		//List quests of particular level
		case "list":
		
			var auth = message.author;
			
			var input = args[1];
			
			var inReg = new RegExp("(^|\W)" + input + "($|\W)");
			
			console.log(inReg);
			
			const folder = './'
			
			
			var outputArr = [];
			
			var fileArr = fs.readdirSync(folder).forEach(file => {
				if(path.extname(file) == '.txt'){
					console.log(file + ' istext');
					var id = fs.readFileSync(file, 'utf8');
					console.log(id);
					quest_board.fetchMessage(id).then(message => {
						message.embeds[0].fields.forEach(field => {
							if(field.name.toLowerCase().includes('level')){
								if(field.value.match(inReg) != null){
									console.log('found one');
									console.log(field.embed.title);
									auth.send(field.embed.title);
								}
							}
						})
					});
				}
			})
			
			break;
    }

});

