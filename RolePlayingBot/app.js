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

//data JSON files
const xp_table = require('./level_xp.json');
const loot_table = require('./loot_table.json');

const folder = './';

var con;

//when ready, log in console
bot.on("ready", () => {

    quest_board = bot.channels.get(quest_board_id);
    adv_guild = quest_board.guild;
	complete_board = bot.channels.get(complete_board_id);
    server = bot.guilds.get(server_id);

    
	con = mysql.createConnection({
		connectionLimit: 10,
		host: "colonelrabbit.com",
		user: "bot_user",
		password: "Adventurer123",
		database: "guildrosterdata"
	});
	
	con.connect(function(err) {
		if (err) throw err;
		console.log("Connected!");
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

        case "dth":

            spend_dth(args, message);

            return;

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

        case "spell":
            //IN PROGRESS, POTENTIALLY ERRORS
            search_spells(args, message);

            return;

        case "loot":

            roll_loot(args, message);

            return;

        //creates an embed displaying the list of commands and sends it
        case "help":

            //embed of bot commands
            var commands = new Discord.RichEmbed()
                .setColor([40, 110, 200])
                .setTitle("RPBot General Commands:")
                .addField('~list [quest level]', 'Lists all quests that have level X.')
                .addField('~join [quest title]', 'Sends a message to the DM that you want to join their quest, and adds your character to the quest.')
                .addField('~spell [spell name]', 'Send you a message displaying the details of the requested spell (incomplete)')
                .addField('~loot [shards spent]', 'Rolls you a magic item based on the shards used and updates your balance')
                .addField('~roll [X]d[Y] [+Z]', "rolls XdY dice with an option for a modifier of +/-Z. Only supports one type of die per roll.")
                .addField('~dth [char name], [hours spent/use]', 'spends DTH for a character. To get gold, make "hours spent" and integer value. You will get 15*hours gp. For proficiencies type the kind proficiency you want to learn. "skill" costs 120 hrs, "weapon" or "armor" costs 80 hours and "tool" or "language" costs 40 hours.')
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

            message.channel.send(message.content + " is not a valid command. Use ~help for a list of commands.");

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
        case "botstatus":

            update_bot_status(args, message);

            break;

        //command to test bot responsiveness, sends a response to the log
        case "test":

            message.author.send("ping!");
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

            message.channel.send(message.content + " is not a valid command. Use ~help for a list of commands.");
            break;

        case "help":

            //embed of Quest Giver bot commands
            var commands = new Discord.RichEmbed()
                .setColor([40, 110, 200])
                .setTitle("RPBot Dungeon Master Commands:")
                .addField('~test', 'PMs a "ping!" to the sender to confirm the bot is working.')
                .addField('~completequest [xp awarded], [char 1], [char 2]', 'awards exp to the specified players at the end of a quest')
                .addField('~addshards [shards awarded], [char 1], [char 2]', 'gives shards to specified players (Duncan only).')
                .addField('~addhours [DTH awarded], [char 1], [char 2]', 'gives DTH hours to specified players (Duncan only).')
                .addField('~quest', '"title" TITLE \n "header1" TEXT1 \n "header2" TEXT2 \n\n*Make sure all quests have a "title". To make a test quest, make the title test.*')
                .addField('~update [quest title], [new status]', 'Updates the status of a quest. \n\n*When the quest is done, set status to "complete" but it will make it so that quest status cannot be changed any further.*')
                .addField('~botstatus [new status]', 'sets the status of the bot.')
                .setThumbnail(bot.user.avatarURL);
            message.author.send(commands);

    }

});

var roll_dice = function (args, message) {
    //if no input return
    if (args[1] != /\dd\d/) {
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
    var regEx = /\W*(.*?),\W(.*?)$/;

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
    bot.user.setGame(text);
}


//INCOMPLETE
//searches database of spells and spits out description
var search_spells = function (args, message) {

    //if no arguments, return
    if (!args[1]) {
        return message.channel.send("Please give a spell");
    }

    //build spell name
    var spell_name = args.splice(1).join(" ");

    //search for spell by name in spell list
    for (spell in spell_list) {
        var current_spell = spell_list[spell];

        //if found, build spell description
        if (current_spell.name.toLowerCase() == spell_name.toLowerCase()) {
            var show_spell = new Discord.RichEmbed()
                .setColor([40, 110, 200])
                .setTitle("Spell")
                .setThumbnail(bot.user.avatarURL);

            //builds a string of basic information on the spell
            var spell_basics = "";

            //spell level
            if (current_spell.level == "0") {
                spell_basics += "Cantrip ";
            } else {
                spell_basics += `Level ${current_spell.level} `;
            }

            //spell school
            switch (current_spell.school) {
                case 'T':
                    spell_basics += `Transmutation`;
                    break;
                case 'E':
                    spell_basics += `Enchantment`;
                    break;
                case 'V':
                    spell_basics += `Evocation`;
                    break;
                case 'C':
                    spell_basics += `Conjuration`;
                    break;
                case 'A':
                    spell_basics += `Abjuration`;
                    break;
                case 'D':
                    spell_basics += `Divination`;
                    break;
                case 'N':
                    spell_basics += `Necromancy`;
                    break;
                case 'I':
                    spell_basics += `Illusion`;
                    break;
                default:
                    spell_basics += `Schoolless`;
            }

            spell_basics += " Spell (";

            //adds spell classes
            for (caster_class in current_spell.classes.fromClassList) {
                spell_basics += `${current_spell.classes.fromClassList[caster_class].name}, `;
            }

            //and spell subclasses
            for (caster_subclass in current_spell.classes.fromSubclass) {
                spell_basics += `${current_spell.classes.fromSubclass[caster_subclass].class.name} (${current_spell.classes.fromSubclass[caster_subclass].subclass.name}), `
            }

            spell_basics = `${spell_basics.substring(0, spell_basics.length - 2)}).`;

            show_spell.addField(current_spell.name, spell_basics);

            //spell casting time
            show_spell.addField("Casting Time", `${current_spell.time[0].number} ${current_spell.time[0].unit}`);

            var description = "";
            var extras = {};

            //INCOMPLETE/BROKEN
            //displays the text of the spell
            //doesn't work for spells with descriptions longer than ~2000 chars
            for (entry in current_spell.entries) {

                if (!current_spell.entries[entry].type) {
                    description += `${current_spell.entries[entry]}\n`;
                } else {
                    extras[current_spell.entries[entry].name] = current_spell.entries[entry].entries;
                }
            }

            console.log(description.length);

            if (description.length > 2000) {
                var description_array = []
                var i = 0;
                while (description.length > 1000) {
                    description_array[i] = description.substring(0, 1000);
                    console.log(description_array[i]);
                    i++;
                    description = description.substring(1000);
                }
                description_array[i] = description;
                show_spell.addField("Description", description_array[0]);

                //console.log(description_array);

                for (i = 1; i < description_array.length; i++) {
                    //show_spell.addField(, description_array[i]);
                }

            } else {
                show_spell.addField("Description", description);
            }

            for (extra in extras) {
                show_spell.addField(extra, extras[extra]);
            }

            message.channel.send(show_spell);
        }
    }

}


var roll_loot = function (args, message) {

    //CHOOSES WHAT TABLE TO ROLL LOOT FROM (SHOULD BE CHANGED TO REFLECT SHARDS USED)
    var table_number = parseInt(Math.random() * 9);
    var table = loot_table[table_number].table;

    //ROLLS A D100 FOR LOOT
    var d100 = parseInt(Math.random() * 100 + 1);

    //FINDS THE RESULT ON CORRECT TABLE
    for (var i = 0; i < table.length; i++) {
        if (table[i].min <= d100 & table[i].max >= d100) {
            message.channel.send(`The Collector gave you a ${table[i].item}`);
            return;
        }
    }

}

var add_character = function (args, message) {

    //return if no arguments
    if (!args[1]) {
        return message.author.send("Invalid number of arguments.");
    }

    //INPUT FORM:
    //~character [char name], [player's username], [starting exp]

	//combines input into a single string for regex
    var text = args.splice(1).join(" ");

    //regEx to get char information
    var regEx = /\W*(.*?)(?:,|$)/g;
    var match;

	var outCats = [];

    //grabs key information from input
	while ((match = regEx.exec(text)[1]) != '') {
        
        try {
                outCats.push(match);
        } catch (e) {
                console.log(e);
                message.author.send("Error adding character, check console for details.");
                return;
        }
        
    }

    //if not enough arguments, return
	if(outCats.length !== 3) {
		message.author.send("Syntax error");
		return;
		
	}

    //gets key information
    var char_name = outCats[0];
    var player_name = outCats[1];
	var initial_xp = parseInt(outCats[2]);	
	var level = check_level(initial_xp);

    var player_id;
    var found_player_id = false;

    //searches for player's discord id in adv_guild members
    adv_guild.members.forEach(member => {
        //if player match is found, get the ID
        if (member.user.username == player_name) {
            player_id = member.user.id;
            //a player match was found, exit loop
            found_player_id = true;
            return;
        }
    });

    //if no player match was found, return
    if (!found_player_id) {
        return message.author.send("no player found");
    }

    //build SQl string
	var sql = "INSERT INTO roster (charName, charPlayer, exp, downHours, riftShards, dead, edited, level) VALUES (\'" + char_name+ "\', \'" + player_id + "\', " + initial_xp + ", 0, 0, 0, 0, " + level + ")";

    //query SQL to add char to roster
    con.query(sql, function (err, result) {
		if (err) throw err;
	    console.log("1 record inserted");
	});
    
}

//WHEN A QUEST IS COMPLETE, AWARD EXP TO CERTAIN PLAYERS
var quest_complete = function (args, message) {

    //Requires at least 2 arguments
    if (!args[2]) {
        return message.author.send("Not enough arguments");
    }

    //input form:
    //~quest_complete xp_value_integer, player1 name, player2 name, player3 name... playerN name
    //doesn't care about line breaks. you can use them or not use them and the regex will be fine

    //gets exp to be awarded from first argument
    var xp = parseInt(args[1]);

    //if an int value couldn't be parsed return
    if (!xp) {
        return message.author.send("The experience value was incorrect");
    }

    //starts at args[2] to ignore the experience value in args[1]
    var text = args.splice(2).join(" ");

    //regEx to extract char names from 'text' string
    var regEx = /\W*(.*?)(?:,|$)/g;
    var match;

    console.log(text);

    var players = [];
    
    //grabs all char names from 'text'
    while ((match = regEx.exec(text)[1]) != '') {
        console.log("ping");
        players.push(match);
    }

    //if no players, return
	if(players.length === 0){
		message.author.send("Incorrect arguments, add players");
		return;	
	}
	
    //builds query to search for all players to be awared exp		
	var quer1 = "SELECT exp, level, charName, charPlayer FROM roster WHERE charName IN (\'";
	for(var i = 0; i < players.length; i++){
		quer1 += players[i] + "\'";
		if(i + 1 != players.length){
			quer1 += ", \'";
		}
	}
	quer1 += ");"

    //builds query to update their exp
	var sql = "UPDATE roster SET exp=exp +" + xp + ", edited=1 WHERE charName IN (\'";
	for(var i = 0; i < players.length; i++){
		sql += players[i] + "\'";
		if(i + 1 != players.length){
			sql += ", \'";
		}
	}
	sql += ");"

    //SQL query to make sure there are no errors
	con.query(quer1, function (err, result, fields) {
		if (err) throw err;

        //if no errors, award exp
		con.query(sql, function (err, result) {
			if (err) throw err;
			console.log("Values updated");
        });		

        //check to see if anyone leveled up
		for(var i = 0; i < result.length; i++){
			newLevel = check_level(parseInt(result[i].exp) + parseInt(xp));
            console.log(newLevel);
            //if they leveld up, update database
			if (newLevel > parseInt(result[i].level)){
				con.query("UPDATE roster SET level=" + newLevel + " WHERE charName=\'" + result[i].charName + "\';", function(err, result) {
					if (err) throw err;
					console.log("Level updated");
				});
				level_message(result[i].charName, result[i].charPlayer, result[i].level);
			}
		}
			
	});
	
}

//GIVES PLAYERS SHARDS AFTER WEEKLY EVENT
var add_shards = function(args, message){

    //if Duncan isn't using the command, it is invalid
    console.log(message.author.username);
	if(message.author.id != '188928848287498240'){
		message.author.send("You do not have permission to use this command!");
		return;
	}

    //checks to make sure there are enough arguments
    if (!args[2]) {
        return message.author.send("Too few arguments");
    }

    //input form:
    //~add_shards [quantity of shards], [player1 name], [player2 name],... 
    //doesn't care about line breaks. you can use them or not use them and the regex will be fine

    //gets exp to be awarded from first argument
    var shards = parseInt(args[1]);

    //if an int value couldn't be parsed return
    if (!shards) {
        return message.author.send("The experience value was incorrect");
    }

    //starts at args[2] to ignore the experience value in args[1]
    var text = args.splice(2).join(" ");

    //regEx to extract char names from 'text' string
    var regEx = /\W*(.*?)(?:,|$)/g;
    var match;

    var players = [];
	
	console.log(text);
	
	//grabs all players to be given shards
	while ((match = regEx.exec(text)[1]) != '') {
        console.log("ping");
    	players.push(match);
    }

    //if no players, return
	if(players.length === 0){
		message.author.send("Incorrect arguments, add players");
		return;	
	}

    //builds sql query to update all players shards
	var sql = "UPDATE roster SET riftShards=riftShards +" + shards + ", edited=1 WHERE charName IN (\'";
	for(var i = 0; i < players.length; i++){
		sql += players[i] + "\'";
		if(i + 1 != players.length){
			sql += ", \'";
		}
	}
	sql += ");"
	
	console.log(sql);

    //SQL updates player information
	con.query(sql, function (err, result) {
		if (err) throw err;
			console.log("Values updated");
		});
	
}

//GIVES ALL PLAYERS DOWNTIME HOURS AT THE END OF WEEK 
//(CURRENTLY IS MANUAL INSTEAD OF AUTOMATIC)
//TO BE CHANGED TO MATCH REGEX FORMAT OF QUEST_COMPLETE AND ADD_SHARDS
var add_hours = function(args, message){

    //if not Duncan, fuck off
    console.log(message.author.username);
	if(message.author.id != '188928848287498240'){
		message.author.send("You do not have permission to use this command!");
		return;
	}
	
    //gets exp to be awarded from first argument
    var hours = parseInt(args[1]);

    //if an int value couldn't be parsed return
    if (!hours) {
        return message.author.send("The experience value was incorrect");
    }

    //starts at args[2] to ignore the experience value in args[1]
    var text = args.splice(2).join(" ");

    //regEx to extract char names from 'text' string
    var regEx = /\W*(.*?)(?:,|$)/g;
    var match;

    var players = [];

    console.log(text);

	while ((match = regEx.exec(text)[1]) != "") {
        players.push(match);        
    }
	
	if(players.length === 0){
		message.author.send("Incorrect arguments, add players");
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
	

	con.query(sql, function (err, result) {
	if (err) throw err;
		console.log("Values updated");
	});
	
}

var level_message = function(character, player, level){
	//playerID = server.members.find(val => val.user.name == player);
	
	//playerID.send(`Congratulations, your character ${character} has made it to level ${level}!`);
	
	
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


//CHECKS IF PLAYER HAS ENOUGH DTH FOR A THING AND THEN UPDATES DATABASE
var spend_dth = function (args, message) {

    //checks to make sure there are enough arguments
    if (!args[2]) {
        return message.author.send("Too few arguments");
    }

    //input form:
    //~spendDTH [player name], [use/quantity of DTH] 
    //doesn't care about line breaks. you can use them or not use them and the regex will be fine

    var text = args.splice(1).join(" ");

    //regEx to extract char names from 'text' string
    var regEx = /\W*(.*?),\W(.*?)$/;
    var match = regEx.exec(text);

    var char_name = match[1];
    var dth_use = match[2];

    if (!char_name || !dth_use) {
        return message.author.send("Syntax or arguments error.");
    }
    
    //checks intent of player and sets expected DTH useage 
    var dth_quantity;
    if (dth_use == "skill") {
        dth_quantity = 120;
    } else if (dth_use == "weapon" || dth_use == "armor") {
        dth_quantity = 80;
    } else if (dth_use == "tool" || dth_use == "language") {
        dth_quantity = 40;
    } else if (parseInt(dth_use)) {
        dth_quantity = parseInt(dth_use);
    } else {
        return message.channel.send("Invalid argument");
    }

    var player = message.author.id;

    //SQL call to verify they have neough, and then update quantity if they do
    var sql = "SELECT `downHours` FROM `roster` WHERE `charPlayer`= '" + player + "' AND `charName` = '" + char_name + "'";

    con.query(sql, function (err, result) {
        if (err) throw err;
        if (result.length == 0) {
            return message.author.send("no match found");
        }
        //gets characters DTH from results
        var dth_available = result[0].downHours;

        //if they are trying to use too many, return
        if (dth_quantity > dth_available) {
            return message.author.send("You don't have enough DTH to do that.")
        }

        //switch statement for player output. 
        switch (dth_quantity) {
            case 1:
            case 2:
            case 3:
            case 4:
            case 5:
            case 6:
            case 7:
            case 8:
                message.channel.send(`${char_name} has spent ${dth_quantity} hours work and and earned ${dth_quantity * 15} gp from your profession.`);
                break;
            case 40:
            case 80:
            case 120:
                message.channel.send(`${char_name} has spent ${dth_quantity} hours learning and picked up a new ${dth_use} proficiency.`);
                break;
            default:
                return message.channel.send("You have given an invalid amount of DTH to spend.");
        }

        //SQL to update character's dth
        var update = "UPDATE roster SET downHours=downHours - " + dth_quantity + ", edited=1 WHERE charName= '" + char_name + "'";
        con.query(update, function (err, result) {
            if (err) throw err;
            console.log("Updated");
        });

    });

}
