/*
Title: RP Bot
Description: Posts quest listings for a D&D adventurers guild campaign
Version: 3.0.2
Author: Colonel Rabbit, Duunko
Requires: node, discord.js, fs
*/

//dependencies
const Discord = require("discord.js");
const fs = require('fs');
const path = require('path');
const package = require('./package.json');
const mysql = require('mysql');

//bot token ***DO NOT SHARE***
const token = package.token;

//prefix for bot commands
const prefix = "~";

//create bot user and login
var bot = new Discord.Client();
bot.login(token);

//Channel Consts
const quest_board_id = '438050640271507466';
const complete_board_id = '438461335337172992';
const server_id = '438048843150393366';
var quest_board;
var adv_guild;
var complete_board;
var server;

const folder = './';

var con;

var xp_table;
var loot_table;



//when ready, log in console
bot.on("ready", () => {

    quest_board = bot.channels.get(quest_board_id);
    adv_guild = quest_board.guild;
	complete_board = bot.channels.get(complete_board_id);
	server = bot.guilds.get(server_id);
	
	var new_xp_table = JSON.parse(fs.readFileSync('level_xp.json', 'utf8'));
	
	var tab = Object.entries(new_xp_table);
	
	xp_table = [];
	
	for(var i = 0; i < tab.length; i++) {
		xp_table.push(tab[i][1]);
	}
	
	con = mysql.createConnection({
		host: "35.185.199.134",
		user: "root",
		password: "Adventurer123",
		database: "rosterinfo"
	});
	
    console.log("Ready");

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

    //read message arguments
    switch (args[0].toLowerCase()) {

        //rolls X dice with Y sides
        //takes input of form: XdY
        case "roll":

            roll_dice(args, message);

            return;

        //PM's the DM to join their quest
        case "join":

            join_quest(args, message);

            return;

        //List quests of particular level
        case "list":

            list_quests(args, message);

            return;

        //creates an embed displaying the list of commands and sends it
        case "help":

            //embed of bot commands
            var commands = new Discord.RichEmbed()
                .setColor([40, 110, 200])
                .setTitle("RPBot General Commands:")
                .addField('~list X', 'Lists all quests that have level X.')
                .addField('~join title', 'Sends a message to the DM that you want to join their quest.')
                .addField('~roll XdY (+Z)', "rolls XdY dice with an option for a modifier of +/-Z (don't add parentheses)")
                .setThumbnail(bot.user.avatarURL);
            message.author.send(commands);

            if (message.channel.type != "dm") {
                message.channel.send("The help menu was PM'ed to you.");
            }

            break;
			
		
		


        //if command doesn't match, notify user and send help list
        default:

            //if a quest giver, not check that the command isn't valid
            if (adv_guild.members.get(message.author.id).roles.find("name", "Dungeon Master")) {
                break;
            }

            message.channel.send(message.content + " is not a valid command. Use *help for a list of commands.");

            break;

    }
    

    //if message sender isn't a "Dungeon Master", stop (QG commands below)
    if (!adv_guild.members.get(message.author.id).roles.find("name", "Dungeon Master")) {
        return;
    }

    //switch statement checks if message contains commands
    switch (args[0].toLowerCase()) {

        //updates status of a quest
        //takes input: "title" new status
        case "update":

            update_quest(args, message);
            
            break;

        //creates a new quest posting
        //takes input of form:
        //"title" TITLE TEXT
        //"header1" TEXT1
        //"header2" TEXT2
        case "quest":
            
			new_quest(args, message);


            break;

        //sets bot "playing" status
        case "status":

            update_bot_status(args, message);

            break;

        //command to test bot responsiveness, sends a response to the log
        case "test":

            console.log("PING");
            break;
			
		//command to add a character
		case "character":
			
			add_character(args, message);
			
			break;
			
		case "completequest":
			
			quest_complete(args, message);
			
			break;
			
		
		case "addshards":
		
			add_shards(args, message);
			
			break;
			
		case "addhours":
		
			add_hours(args, message);
			
			break;

        //if not a valid command, note it
        default:

            message.channel.send(message.content + " is not a valid command. Use *help for a list of commands.");
            break;

        case "help":

            //embed of Quest Giver bot commands
            var commands = new Discord.RichEmbed()
                .setColor([40, 110, 200])
                .setTitle("RPBot Dungeon Master Commands:")
                .addField('*quest', '"title" TITLE \n "header1" TEXT1 \n "header2" TEXT2 \n\n*Make sure all quests have a "title". To make a test quest, make the title test.*')
                .addField('*update', '"title" new status \n\n*When the quest is done, set status to "complete" but it will make it so that quest status cannot be changed any further.*')
                .addField('*status', 'sets the game the bot is playing.')
                .setThumbnail(bot.user.avatarURL);
            message.author.send(commands);

    }

});

var roll_dice = function (args, message) {
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
    message.author.send(output);
    
}

var join_quest = function (args, message) {
    //sets message author 
    var auth = message.author;
    //no match found yet
    var found = false;
    //reads input arguments
    var quest = args.splice(1).join(" ");

    //search all quest txt files
    fs.readdirSync(folder).forEach(file => {
        if (file == quest + '.txt') {
            //grab contents of txt files
            var id = fs.readFileSync(file, 'utf8');
            console.log(id);
            //searches quest board for the message with id
            quest_board.fetchMessage(id).then(message => {
                //if there is a quest...
                if (message) {
                    //get the quest's dm and search the guild members for them
                    var questmaker = message.embeds[0].author.name;
                    adv_guild.members.forEach(member => {
                        //when dm is found...
                        if (member.user.username == questmaker) {
                            //send them a message that someone wants to join that quest
                            member.user.send(`${auth} would like to join ${quest}.`);
                            //notify the joinee that the DM recieved their join request
                            auth.send(`${questmaker} was notified that you would like to join their quest.`);
                            //the quest was found
                            found = true;
                            return;
                        }
                    });
                }
                //if there wasn't a quest found, tell the joinee
                if (!found) {
                    auth.send("I couldn't find that quest.");
                }
            });
        }
    });
}

var list_quests = function (args, message) {
    //set author of message
    var auth = message.author;

    //read argument
    var input = args[1];

    //turn input into a regex expression to search for level requirements
    var inReg = new RegExp("(\W|^)" + input + "(\W|$)");
    console.log(inReg);

    //prep the message
    auth.send("Quests of level " + input);

    //reads directory of quest files for each
    var fileArr = fs.readdirSync(folder).forEach(file => {
        //looks for only txt files
        if (path.extname(file) == '.txt') {
            console.log(file);
            //grabs content of file
            var id = fs.readFileSync(file, 'utf8');
            console.log(id);
            //searches quest board for a message with the id
            quest_board.fetchMessage(id).then(message => {
                //if a match is found...
                if (message) {
                    //... search the embed for a field with "lvl" or "level"
                    message.embeds[0].fields.forEach(field => {
                        if (/level|lvl/.test(field.name.toLowerCase())) {
                            console.log(field.value);
                            //check if the quest listing has the requested level
                            if (field.value.match(inReg) != null) {
                                console.log(field.embed.title);
                                //if it does, send quest title to author of message
                                auth.send(field.embed.title);
                            }
                        }
                    });
                }
            });
        }
    });
}

var update_quest = function (args, message) {
    //combines input into a string
    var input = args.splice(1).join(" ");

    //regex seperates title and status
    var regEx = /"(.*)"\W*(.*)/;

    var match;
    if (match = regEx.exec(input)) {
        var title = match[1];
        var status = match[2];
    }
    else {
        message.channel.send("Error, please try again.");
        return;
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
        quest_board.fetchMessage(id).then(message => {
            message.edit("**QUEST STATUS: " + status.toUpperCase() + "**");
        });
    } catch (error) {
        //if error, log error and notify user
        console.log(error);
        message.channel.send("Error, please try again.");
    }

}

var new_quest = function (args, message) {
    //creates embed for quest listing
    var listing = new Discord.RichEmbed().
        setAuthor(message.author.username).
        setThumbnail(message.author.avatarURL);

    //combines input into a single string for regex
    var text = args.splice(1).join(" ");

    //searches for new lines and seperates headers from texts
    var regEx = /^(?:"|“)(.*?)\W*(?:"|”) (.*?)$/gm;
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
                message.author.send("Error posting quest, check console for details; likely a field exceeded 1024 characters.");
                return;
            }
        }
    }

    //if a title wasn't provided, don't post the quest
    if (!listing.title) {
        message.author.send("Your quest needs a title, please remake the quest.");
        return;
    }

    console.log(listing.title);

    //allows for "test" quests
    if (listing.title.toLowerCase() == "test") {
        message.author.send("**QUEST STATUS: OPEN**", listing);
        return;
    }

    //send embed w/ quest status text
    quest_board.send("**QUEST STATUS: OPEN**", listing)
        .then((message) => {

            //after message is sent, bot reads finds message id and stores as txt file
            console.log(message.id);

            //grab ID of message, and title of embed
            var id = message.id;
            var title = message.embeds[0].title;

            //create a file with name "title.txt" and content of the quest posting ID
            fs.writeFileSync(__dirname + '/' + title + ".txt", id);
        });
}

var update_bot_status = function (args, message) {
    //if there's no arguments, return
    if (!args[1]) {
        return;
    }

    //read arguments
    var text = args.splice(1).join(" ");

    //set status
    bot.user.setPresence({ status: 'online', game: { name: text } });
}


var add_character = function (args, message) {
	//if there are not the right number of arguments, return.
	
	//combines input into a single string for regex
    var text = args.splice(1).join(" ");

    //searches for new lines and seperates headers from texts
    var regEx = /^(?:"|“)(.*?)\W*(?:"|”) (.*?)$/gm;
    var match;
	
	var outCats = [];
	
	while ((match = regEx.exec(text)) !== null) {
        console.log("ping");
        try {
                outCats.push(match[2]);
        } catch (e) {
                console.log(e);
                message.author.send("Error adding character, check console for details.");
                return;
        }
        
    }
	
	if(outCats.length !== 3) {
		message.author.send("Syntax error");
		return;
		
	}
	
	var xp = parseInt(outCats[2]);
	
	var level = check_level(xp);
	
	
	
	
	
	con.connect(function(err) {
		if (err) throw err;
		console.log("Connected!");
		var sql = "INSERT INTO roster (charName, charPlayer, exp, downHours, riftShards, dead, edited, level) VALUES (\'" + outCats[0]+ "\', \'" + outCats[1] + "\', " + outCats[2] + ", 0, 0, 0, 0, " + level + ")";
		con.query(sql, function (err, result) {
		if (err) throw err;
			console.log("1 record inserted");
		});
	});
}


var quest_complete = function(args, message) {
	
	var text = args.splice(1).join(" ");
	
	var regEx = /^(?:"|“)(.*?)\W*(?:"|”) (.*?)$/gm;
    var match;
	
	console.log(text);
	
	var players = [];
	var xp;
	var checker = false;
	
	while ((match = regEx.exec(text)) !== null) {
        console.log("ping");
		if(match[1].toLowerCase() == "player"){
			players.push(match[2]);
		}
        else if(match[1].toLowerCase() == 'xp' || match[1].toLowerCase == 'exp') {
			
			xp = match[2];
			checker = true;
        } 
        
    }
	
	if(checker === false || players.length === 0){
		message.author.send("Incorrect arguments, add players or an XP value");
		console.log(checker + " " + xp + " " + players.length);
		return;	
	}
	
		
	var quer1 = "SELECT exp, level, charName, charPlayer FROM roster WHERE charName IN (\'";
	for(var i = 0; i < players.length; i++){
		quer1 += players[i] + "\'";
		if(i + 1 != players.length){
			quer1 += ", \'";
		}
	}
	quer1 += ");"
	
	var sql = "UPDATE roster SET exp=exp +" + xp + ", edited=1 WHERE charName IN (\'";
	for(var i = 0; i < players.length; i++){
		sql += players[i] + "\'";
		if(i + 1 != players.length){
			sql += ", \'";
		}
	}
	sql += ");"
	
	con.connect(function(err) {
		if (err) throw err;
		con.query(quer1, function (err, result, fields) {
			if (err) throw err;
			
			con.query(sql, function (err, result) {
				if (err) throw err;
				console.log("Values updated");
			});		
			for(var i = 0; i < result.length; i++){
				newLevel = check_level(parseInt(result[i].exp) + parseInt(xp));
				console.log(newLevel);
				if (newLevel > parseInt(result[i].level)){
					con.query("UPDATE roster SET level=" + newLevel + " WHERE charName=\'" + result[i].charName + "\';", function(err, result) {
						if (err) throw err;
						console.log("Level updated");
					});
					level_message(result[i].charName, result[i].charPlayer, result[i].level);
				}
			}
			
		});
	});
	
	
}

var add_shards = function(args, message){
	console.log(message.author.username);
	if(message.author.id != '188928848287498240'){
		message.author.send("You do not have permission to use this command!");
		return;
	}
	
	var text = args.splice(1).join(" ");
	
	var regEx = /^(?:"|“)(.*?)\W*(?:"|”) (.*?)$/gm;
    var match;
	
	console.log(text);
	
	var players = [];
	var shards;
	var checker = false;
	
	while ((match = regEx.exec(text)) !== null) {
        console.log("ping");
		if(match[1].toLowerCase() == "player"){
			players.push(match[2]);
		}
        else if(match[1].toLowerCase() == 'shards') {
			
			shards = match[2];
			checker = true;
        } 
        
    }
	
	if(checker === false || players.length === 0){
		message.author.send("Incorrect arguments, add players or a shard value");
		console.log(checker + " " + xp + " " + players.length);
		return;	
	}
	
	var sql = "UPDATE roster SET riftShards=riftShards +" + shards + ", edited=1 WHERE charName IN (\'";
	for(var i = 0; i < players.length; i++){
		sql += players[i] + "\'";
		if(i + 1 != players.length){
			sql += ", \'";
		}
	}
	sql += ");"
	
	console.log(sql);
	
	con.connect(function(err) {
		if (err) throw err;
		console.log("Connected!");
		con.query(sql, function (err, result) {
		if (err) throw err;
			console.log("Values updated");
		});
	});
	
}

var add_hours = function(args, message){
	console.log(message.author.username);
	if(message.author.id != '188928848287498240'){
		message.author.send("You do not have permission to use this command!");
		return;
	}
	
	var text = args.splice(1).join(" ");
	
	var regEx = /^(?:"|“)(.*?)\W*(?:"|”) (.*?)$/gm;
    var match;
	
	console.log(text);
	
	var players = [];
	var hours;
	var checker = false;
	
	while ((match = regEx.exec(text)) !== null) {
        console.log("ping");
		if(match[1].toLowerCase() == "player"){
			players.push(match[2]);
		}
        else if(match[1].toLowerCase() == 'hours') {
			
			hours = match[2];
			checker = true;
        } 
        
    }
	
	if(checker === false || players.length === 0){
		message.author.send("Incorrect arguments, add players or a shard value");
		console.log(checker + " " + xp + " " + players.length);
		return;	
	}
	
	var sql = "UPDATE roster SET downHours=downHours +" + hours + ", edited=1 WHERE charName IN (\'";
	for(var i = 0; i < players.length; i++){
		sql += players[i] + "\'";
		if(i + 1 != players.length){
			sql += ", \'";
		}
	}
	sql += ");"
	
	console.log(sql);
	
	con.connect(function(err) {
		if (err) throw err;
		console.log("Connected!");
		con.query(sql, function (err, result) {
		if (err) throw err;
			console.log("Values updated");
		});
	});
	
}

var level_message = function(character, player, level){
	//playerID = server.members.find(val => val.user.name == player);
	
	//playerID.send("Congratulations, your character " + character + " has made it to level " + level + "!");
	
	
}

var check_level = function(xp) {
	var retval = 1
	for(var i = 0; i < xp_table.length; i++){
		if(xp >= xp_table[i][0]){
			retval = xp_table[i][1];
		} else {
			break;
		}
		
	}
	return retval;
}

