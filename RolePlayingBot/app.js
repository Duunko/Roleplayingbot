/*
Title: RP Bot
Description: Posts quest listings for a D&D adventurers guild campaign
Version: 2.0.0
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

//for exp/level calculations
const level_up_breakpoints = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000];

//prefix for bot commands
const prefix = "~";

//create bot user and login
var bot = new Discord.Client();
bot.login(token);

//Channel Consts
const quest_board_id = '438050640271507466';
const complete_board_id = '438461335337172992';
var quest_board;
var adv_guild;
var complete_board;

const folder = './';

var con;



//when ready, log in console
bot.on("ready", () => {

    quest_board = bot.channels.get(quest_board_id);
    adv_guild = quest_board.guild;
	complete_board = bot.channels.get(complete_board_id);
	
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



var search_spells = function (args, message) {

    if (!args[1]) {
        return message.channel.send("Please give a spell");
    }

    var spell_name = args.splice(1).join(" ");

    for (spell in spell_list) {
        var current_spell = spell_list[spell];
        if (current_spell.name.toLowerCase() == spell_name.toLowerCase()) {
            var show_spell = new Discord.RichEmbed()
                .setColor([40, 110, 200])
                .setTitle("Spell")
                .setThumbnail(bot.user.avatarURL);

            var spell_basics = "";

            if (current_spell.level == "0") {
                spell_basics += "Cantrip ";
            } else {
                spell_basics += `Level ${current_spell.level} `;
            }

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

            for (caster_class in current_spell.classes.fromClassList) {
                spell_basics += `${current_spell.classes.fromClassList[caster_class].name}, `;
            }


            for (caster_subclass in current_spell.classes.fromSubclass) {
                spell_basics += `${current_spell.classes.fromSubclass[caster_subclass].class.name} (${current_spell.classes.fromSubclass[caster_subclass].subclass.name}), `
            }

            spell_basics = `${spell_basics.substring(0, spell_basics.length - 2)}).`;

            show_spell.addField(current_spell.name, spell_basics);

            show_spell.addField("Casting Time", `${current_spell.time[0].number} ${current_spell.time[0].unit}`);

            var description = "";
            var extras = {};

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
	
	con.connect(function(err) {
		if (err) throw err;
		console.log("Connected!");
		var sql = "INSERT INTO roster (charName, charPlayer, exp, downHours, riftShards, dead, edited) VALUES (\'" + outCats[0]+ "\', \'" + outCats[1] + "\', " + outCats[2] + ", 0, 0, 0, 0)";
		con.query(sql, function (err, result) {
		if (err) throw err;
			console.log("1 record inserted");
		});
	});
}


var quest_complete = function (args, message) {

    //input form:
    //~quest_complete xp_value_integer, player1 name, player2 name, player3 name... playerN name

    //doesn't care about line breaks. you can use them or not use them and the regex will be fine

    var xp = parseInt(args[1]);

    if (!xp) {
        return message.author.send("The experience value was incorrect");
    }

    //starts at args[2] to ignore the experience value
    var text = args.splice(2).join(" ");

    var regEx = /\W*(.*?)(?:,|$)/g;
    var match;

    console.log(text);

    var players = [];
    var xp;

    while ((match = regEx.exec(text)) !== null) {
        console.log("ping");
        players.push(match[1]);
    }

    if (players.length === 0) {
        return message.author.send("Incorrect arguments, there needs to be at least 1 player");
    }

    var sql = "UPDATE roster SET exp=exp +" + xp + ", edited=1 WHERE charName IN (\'";
    for (var i = 0; i < players.length; i++) {
        sql += players[i] + "\'";
        if (i + 1 != players.length) {
            sql += ", \'";
        }
    }
    sql += ");"

    console.log(sql);

    con.connect(function (err) {
        if (err) throw err;
        console.log("Connected!");
        con.query(sql, function (err, result) {
            if (err) throw err;
            console.log("Values updated");
        });
    });

    //SQL CALL TO GET LIST OF PLAYERS, RETURNS ARRAY/OBJECT



    /////////////////////////////////

    for (player in players) {
        player.exp += exp_gained;
        var changed = false;
        while (player.exp > level_up_breakpoints[player.level]) {
            player.level++;
        }
        if (changed) {
            message.channel.send(`${player.char_name} has leveled up to ${player.level}`);
            //SQL UPDATE LEVEL 

            //////////////////
        }
    }

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



var spend_dth = function (args, message) {

    var dth_use = args.splice(1).join(" ");
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


    //SQL CALL TO VERIFY HAVE NECESSARY DTH TO SPEND
    var sqlCall;
    var player = sqlCall;
    if (player.dth < dth_quantity) {
        return message.channel.send("You do not have enough DTH for this task.");
    }
    /////////////////////////////////////////////////

    switch (dth_quantity) {
        case 0:
        case 1:
        case 2:
        case 3:
        case 4:
        case 5:
        case 6:
        case 7:
        case 8:
            message.channel.send(`${player.char_name} has spent ${dth_quantity} hours work and and earned ${dth_quantity * 15} gp from your profession.`);
            break;
        case 40:
        case 80:
        case 120:
            message.channel.send(`${player.char_name} has spent ${dth_quantity} hours learning and picked up a new ${dth_use} proficiency.`);
            break;
        default:
            return message.channel.send("You have given an invalid amount of DTH to spend.");
    }

    //SQL CALL TO UPDATE PLAYERS DTH HOURS FOR PLAYER



    /////////////////////////////////////////////////


}