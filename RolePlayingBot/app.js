/*
Title: RP Bot
Description: Posts quest listings for a D&D adventurers guild campaign
Version: 3.0.2
Author: Colonel Rabbit, Duunko
Requires: node, discord.js, fs, mysql
*/

//dependencies
const Discord = require("discord.js");
const fs = require('fs');
const path = require('path');
const package = require('./package.json');
const mysql = require('mysql');

//bot token ***DO NOT SHARE***
const token = package.token;

//mubot's token, used for Beta development
//const token = "MzYwMjEzNjU1MDA4MzEzMzU1.DL7GEg.n9ASGR38j8Q8hTNWW4L5anOxpRM";

//prefix for bot commands
const prefix = "~";


//alt prefix used for mubot in Beta development
//const prefix = "!";


//create bot user and login
var bot = new Discord.Client();
bot.login(token);

//Channel Consts
const quest_board_id = '438050640271507466';
const archive_id = '438106323490570250';
const complete_board_id = '438461335337172992';
const duncan_id = '188928848287498240';
const announcement_id = '438049253969887253';
const bot_commands_id = '441609746475122688';
const general_id = '438048843674943498';
const party_channels = ['438107822149074979', '438107859553746950', '438107902683643917'];
var quest_board;
var archive;
var server;
var complete_board;
var announcement_board;
var bot_commands;
var general_chat;

var lockout = false;

//data JSON files
const xp_table = require('./level_xp.json');
const loot_table = require('./loot_table.json').magicitems;

var spell_list = []; 
spell_list.push.apply(spell_list, require('./spells-phb.json').spell);
spell_list.push.apply(spell_list, require('./spells-bols.json').spell);
spell_list.push.apply(spell_list, require('./spells-scag.json').spell);
spell_list.push.apply(spell_list, require('./spells-ua-mm.json').spell);
spell_list.push.apply(spell_list, require('./spells-ua-ss.json').spell);
spell_list.push.apply(spell_list, require('./spells-ua-tobm.json').spell);
spell_list.push.apply(spell_list, require('./spells-xge.json').spell);

var item_list = require('./items.json').item;
item_list.push.apply(item_list, require('./variant_items.json').variant);

//Weekly xp tables
const rest_thresholds = [[4,20], [8,15], [12, 10], [17, 8], [20, 5], [29, 1]];

var homebrew_list = require('./approved-homebrew.json');

const folder = './';

var con;
var pool;

var dateA;

//when ready, log in console
var on_ready = bot.on("ready", () => {

    quest_board = bot.channels.get(quest_board_id);
	announcement_board = bot.channels.get(announcement_id);
	archive = bot.channels.get(archive_id);
    server = quest_board.guild;
	complete_board = bot.channels.get(complete_board_id);
    bot_commands = bot.channels.get(bot_commands_id);
    general_chat = bot.channels.get(general_id);

	pool = mysql.createPool({
		connectionLimit: 10,
		host: "colonelrabbit.com",
		user: "bot_user",
		password: "Adventurer123",
		database: "guildrosterdata"
    });

	//Get the date
	dateA = new Date(); 
	
	var months30 = [4, 6, 9, 11];
	//Add to this if time goes on and we need to
	var leapYears = [2020];
	
	var currentDay = dateA.getDay();
	var currentDate = dateA.getDate();
	var currentMonth = dateA.getMonth();
	var currentYear = dateA.getFullYear();
	var dayAdjust = 2-currentDay;
	if(dayAdjust < 0) {
		dayAdjust = 7 + dayAdjust;
	}
	var dateAdjust = currentDate + dayAdjust;
	var monthAdjust = currentMonth;
	var yearAdjust = currentYear;
	if(dateAdjust > 28) {
		if(currentMonth == 2) {
			if(leapYears.includes(currentYear)){
				if(dateAdjust > 29) {
					dateAdjust -= 29;
					monthAdjust += 1;
				}
			} else {
				dateAdjust -= 28;
				monthAdjust += 1;
			}
			
		} else if (months30.includes(currentMonth)) {
			if(dateAdjust > 30) {
				dateAdjust -= 30;
				monthAdjust += 1;
			}
		} else {
			if(dateAdjust > 31) {
				dateAdjust -= 31;
				monthAdjust += 1;
			}
		}
	}
	if(monthAdjust > 11) {
		monthAdjust = 1;
		yearAdjust +=1;
	}
	
	var dateB = new Date(yearAdjust, monthAdjust, dateAdjust, 12, 0, 0, 0);
	
	console.log("weekly timed generation fires " + dateB);
	
	var adjustedTime = dateB.getTime() - dateA.getTime();
	setTimeout(lockout_warning, adjustedTime - (30 * 60 * 1000));	
	setTimeout(weekly_progress, adjustedTime);
	setTimeout(keepAlive, 2*60*60*1000);	
	
    console.log("Ready");

});

//Auto assigns new members to the "Guild Members" Role
var on_join = bot.on("guildMemberAdd", function (member) {

    var guild_member_role = server.roles.find('name', 'Guild Member');

    member.addRole(guild_member_role); 

    general_chat.send(`<@${member.id}> has joined the Guild, welcome!`);


});

//when message is posted in a chat, check to see how the bot should respond
var on_message = bot.on("message", function (message) {

    
	pool.getConnection(function(err,connection) {
		if (err) throw err ;
		con = connection;
	
		//if bot sent the message, check to see if it was a quest posting, else return
		if (message.author.equals(bot.user)) {
			con.release();
			return;
		}

		//if message doesn't start with proper prefix, ignore
		if (!message.content.startsWith(prefix)) {
			con.release();
			return;
		}

        if (lockout == true) {
		con.release();
            message.channel.send("The bot is currently unavailable. Check the announcements board for more information.");
            return;
        }
		//seperate message into array based on spaces (get rid of prefix)
		var args = message.content.substring(prefix.length).split(" ");

        if (message.channel != bot_commands && message.channel.type != 'dm') {
			if(args[0].toLowerCase() !== "roll") {
				con.release();
				return message.author.send("You need to DM me or use the #bot-commands channel.");
			} else {
				if(!party_channels.includes(message.channel)) {
					con.release();
					return message.author.send("You can only roll in #bot-commands or the party channels.");
				}
			}
        }


		

		//read message arguments
        switch (args[0].toLowerCase()) {

			case "dth":

				spend_dth(args, message);
				con.release();
				return;

			//rolls X dice with Y sides
			//takes input of form: XdY
			case "roll":

				roll_dice(args, message);
				con.release();
				return;

			//PM's the DM to join their quest
			case "join":
				join_quest(args, message);
				con.release();
				return;
				
			case "leave":
				leave_quest(args,message);
				con.release();
				return;

			//List quests of particular level
            case "list":

                list_quests(args, message);
		        con.release();
                return;
			//Lists the information about a particular quest
			case "checkquest":
			
				check_quest(args_message);
				con.release();
				return;

            //Displays information about an item
			case "item":

				search_items(args, message);
				con.release();
				return;

            //Rolls a magic item for the specified player based on shards spent
			case "shards":

				roll_loot(args, message);
				con.release();
				return;

            //Displays information about a spell
			case "spell":
				
				search_spells(args, message);
				con.release();
				return;

            //Checks a characters exp, level, dth and shards
			case "check":
			
				check_character(args, message);
				con.release();	
                return;

            //Prints a list of approved homebrew and uploads JSON file
            case "homebrew":

                show_homebrew(args, message);
		        con.release();
                return;

            //Prints a list of the shops current stock
            case "shop":

                view_shop(args, message);
                con.release();
                return;

            //Rolls a character stat array based on guild rules
            case "rollchar":

                roll_char(args, message);
                con.release();
                return;

			//creates an embed displaying the list of commands and sends it
			case "help":

				//embed of bot commands
                var commands = new Discord.RichEmbed()
                    .setColor([40, 110, 200])
                    .setTitle("RPBot General Commands:")
                    .addField('~list [quest level]', 'Lists all quests that have level X.')
					.addField('checkquest [quest title]', 'Sends you the name, level, DM, and active players on a given quest.')
                    .addField('~join [quest title], [character]', 'Sends a message to the DM that you want to join their quest, and adds your character to the quest.')
                    .addField('~leave [quest title], [character]', 'Removes your character from a quest that they\'re on and notifies the DM.')
					.addField('~spell [spell name]', 'Sends you a message displaying the details of the requested spell')
					.addField('~homebrew', 'Posts the current approved homebrew json file. Use the manage homebrew option on 5etools to view it.')
                    .addField('~dth [character], [use/number]', 'Spends downtime hours for either a use or a number for professions. Check the FAQ for details.')
					.addField('~shards [character], [shards spent]', 'Rolls loot for you on the Shard Loot table based on the shards spent. The breakpoints for each table are 2, 4, 8, 14, 22, 30 and 40 shards. The bot will automatically round you down to the closest table breakpoint.')
                    .addField('~item [item name]', 'Sends you a message displaying the details of the requested item.')
					.addField('~shop', 'Shows you the current inventory of Soots\'s Shop')
                    .addField('~shards [character], [shards spent]', 'Rolls you a magic item based on the shards used and updates your balance of shards.')
                    .addField('~roll [X]d[Y] [+Z]', "rolls XdY dice with an option for a modifier of +/-Z. Only supports one type of die per roll. Spacing is important.")
				message.channel.send(commands);

				break;
				
			//if command doesn't match, notify user and send help list
			default:

				//if a DM, don't check that the command isn't valid because they have more commands to search
				if (server.members.get(message.author.id).roles.find("name", "Dungeon Master")) {
					break;
				}

				message.channel.send("~" + args[0] + " is not a valid command. Use ~help for a list of commands.");

				break;

		}
		

		//if message sender isn't a "Dungeon Master", stop (QG commands below)
        if (!server.members.get(message.author.id).roles.find("name", "Dungeon Master")) {
            con.release();
			return;
		}

		//switch statement for DM commands
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

				message.channel.send("ping!");
				console.log("PING");
				break;
				
			//command to add a character
			case "character":
				
				add_character(args, message);
				
				break;
				
			case "complete":
				//Does nothing currently
				quest_complete(args, message);
				
				break;
				
			case "addxp":
				
				manual_xp(args, message);
				
				break;
				
			
			case "addshards":
			
				add_shards(args, message);
				
				break;
				
			case "addhours":
			
				add_hours(args, message);
				
				break;
				
			case "fire":
				
				fire_quest(args, message);
				
                break;


            case "buyitem":

                buy_item(args, message);

                break;
				
			//messages the members on the quest
			//Format ~messagequest [Title], [Message]
			case "messagequest":
			
				message_members(args, message);
				
				break;
			//Fires the weekly progress function. For testing purposes
			case "progress":
				
				if(message.author.id == duncan_id) {
					weekly_progress();
				} else {
                    message.channel.send("You are not Duncan, heathen!");
                }

                break;

            case "roster":

                list_guild(args, message);
                break;


			//if not a valid command, note it
			default:

				mmessage.channel.send("~" + args[0] + " is not a valid command. Use ~help for a list of commands.");
				
				break;

			case "help":

				//embed of Quest Giver bot commands
				var commands = new Discord.RichEmbed()
					.setColor([40, 110, 200])
					.setTitle("RPBot Dungeon Master Commands:")
                    .addField('~quest', '"title" TITLE \n "level" [party level] \n "size" [party size] \n\n*All quests must have a "title", "level", and "size". To test the formatting of your quest listing, make the title **TEST**.*')
                    .addField('~fire [quest name]', 'Launches the specified quest, sets its status to IN PROGRESS, and notifies players on the quest.')
                    .addField('~complete [quest name], [xp awarded]', 'Closes a quest and awards experience to players on the quest')
                    .addField('~character [new character name], [player\'s username], [starting xp]','Makes a new character for the specified player.')
                    .addField('~addxp [xp awarded], [char 1], [char 2]', 'Manually adds experience to a group of players. Notifies Duncan')
                    .addField('~buyitem [char buying], [item name]', 'Lets the player buy the item at price and removes it from the shop. Players cannot buy items without DM permission')
                    .addField('~fire [quest name]', 'Launches the specified quest and notifies players on the quest.')
					.addField('~addxp [xp awarded], [character 1], [character2]', 'awards exp to the specified players. Only use this command if you mess up. Alerts Duunko whenever you use it.')
                    .addField('~messagequest [quest name], [message]', 'for the author of a quest only. Messages every player currently on the quest.') 
					.addField('~complete [quest name], [xp awarded]', 'awards exp to the players on a quest and closes the quest.')
                    .addField('~buyitem [char buying], [item name]', 'Lets the player buy the item at price and removes it from the shop')
					.addField('~messagequest [quest name], [message text]', 'Message all the players on a quest you are running a particular message. Only works if you are the DM of that quest.')
                    .addField('~roster', 'Lists the entire guild roster and each character\'s level.')
					.addField('~botstatus [new status]', 'sets the status of the bot.')
                    .addField('~test', 'Prints a "ping!" to confirm the bot is working.')
					.setThumbnail(bot.user.avatarURL);
				message.channel.send(commands);

		}
	con.release();
	});
});

var keepAlive = function(){
  pool.getConnection(function(err, connection){
    if(err) { return; }
    connection.query( "SELECT 1", function(err, rows) {
        connection.release();
        if (err) {
            console.log("QUERY ERROR: " + err);
        }
      });
  });
  setTimeout(keepAlive, 6*60*60*1000);
}


var lockout_warning = function() {
	
	announcement_board.send("Weekly downtime in 30 minutes. Make sure that all finished quests have been closed with ~complete or you may lose downtime rewards.");
	bot.user.setGame("Lockout 4AM PST");
	
}

var weekly_progress = function() {
	lockout = true;
	var fullHours = [];
	var halfHours = [];
	pool.getConnection(function(err,connection) {
		if (err) throw err ;
		con = connection;
		var con2;
		pool.getConnection(function(err, connection2) {
			if(err) {
				console.log(err);
				return;
			}
			con2 = connection2;
			con2.query("SELECT * FROM roster", function(err, result) {
				if (err) {
					console.log(err);
					return;
				}
			
				for(entry in result) {
					if(result[entry].dead == 1) {
						continue;
					}
					switch(result[entry].numQuests) {
						
						case 0:
							//Gets the xp percentage based on level
							var percentage = 25;
							var xpTotal;
							for(var i = 0; i < rest_thresholds.length; i++) {
								if(rest_thresholds[i][0] < result[entry].level) {
									percentage = rest_thresholds[i][1];
								} else {
									break;
								}
							}
							var levelIndex = result[entry].level - 2;
							if(result[entry].level == 1) {
								xpTotal = 75;
							}else {
								xpTotal = Math.floor(((xp_table[levelIndex + 1][0] - xp_table[levelIndex][0])/100)*percentage);
							}
							
							//Adds player to an array because award_xp is a bitch like that
							var player = [];
							player.push(result[entry].charName);
							//Adds to the list of people getting full dth
							fullHours.push(result[entry].entryID);
							//Messages the player
							var play = server.members.get(result[entry].charPlayer);
							play.send(result[entry].charName + " got " + xpTotal + " experience and 20 Downtime Hours for their restful week.");
							award_xp(player, xpTotal);
							
							break;
							
						case 1:
							//Gets the xp percentage based on level
							//Gets the xp percentage based on level
							var percentage = 25;
							var xpTotal;
							for(var i = 0; i < rest_thresholds.length; i++) {
								if(rest_thresholds[i][0] < result[entry].level) {
									percentage = rest_thresholds[i][1];
								} else {
									break;
								}
							}
							var levelIndex = result[entry].level - 2;
							if(result[entry].level == 1) {
								xpTotal = 37;
							}else {
								xpTotal = Math.floor((((xp_table[levelIndex + 1][0] - xp_table[levelIndex][0])/100)*percentage)/2);
							}
							//Adds player to an array because award_xp is a bitch like that
							var player = [];
							player.push(result[entry].charName);
							//Adds to the list of people getting half dth
							halfHours.push(result[entry].entryID);
							//Messages the player
							var play = server.members.get(result[entry].charPlayer);
							play.send(result[entry].charName + " got " + xpTotal + " experience and 10 Downtime Hours for their restful moments this week.");
							award_xp(player, xpTotal);
							
							break;
							
							
						
						default:
							var play = server.members.get(result[entry].charPlayer);
							play.send("No downtime or passive experience for " + result[entry].charName + " this week, you've been on too many quests!");
							
							break;		
					}
				}
				var sql = "UPDATE roster SET downHours=downHours+20 WHERE entryID=\'";
				for(var i = 0; i < fullHours.length; i++) {
					if(i == 0) {
						sql+= fullHours[i];
					} else {
						sql+= " OR entryID=" + fullHours[i];
					}
					
				}
				sql = ";"
				var sql2 = "UPDATE roster SET downHours=downHours+20 WHERE entryID=\'";
				for(var i = 0; i < fullHours.length; i++) {
					if(i == 0) {
						sql2+= fullHours[i];
					} else {
						sql2+= " OR entryID=" + fullHours[i];
					}
					
				}
				sql2 = ";"
				con2.query(sql, function(err, result2) {
					if(err) {
						console.log(err);
					}
					console.log("Fullhours updated");
					
					con2.query(sql2, function(err, result3) {
						if(err) {
							console.log(err);
						}
						console.log("Halfhours updated");
						
						con2.query("UPDATE roster SET numQuests= numQuests - completeQuests, completeQuests = 0", function(err, result4) {
							if (err) {
								console.log("Oops");
							}
							
							console.log("numQuests updated");
							
						});
					});
					
					
				});
			});
			con2.release();
		});
		con.release();
	});
	lockout = false;
	announcement_board.send("Weekly downtime Complete.");
	bot.user.setGame("Lockout Complete");
	setTimeout(lockout_warning, 7*24*60*60*1000); 
	setTimeout(weekly_progress, (7*24*60*60*1000) - (30*60*1000));
	
	
	
	
}

var check_quest = function(args, message) {
	var quest = args.splice(1).join(" ");
	
	con.query("SELECT * FROM quest_data WHERE quest_name=${quest};", function(err, result) {
		if(err) {
			message.author.send("Something went wrong. Try again in a couple of minutes.");
		}
		if(result == undefined) {
			message.author.send("No such quest by that name. Check and make sure you spelled everything correctly and try again!");
			return;
		}
		
		if(result[0].active_players == '') {
			message.author.send("${quest}\nQuest DM: ${cDM}\nQuest Level: ${result[0].quest_lvl}\nQuest Status: ${result[0].quest_status}\nActive Players: None");
			return;
			
		}
		
		var cUP = result[0].active_players.split(" ");
		var sql = "SELECT * FROM roster WHERE entryID=";
		for(var i = 0; i < cUP.length; i++) {
			if(i == 0) {
				sql += cUP[i];
			} else {
				sql+= " OR entryID=" + cUP[i];
			}
		}
		sql += ";";
		
		con.query(sql, function(err, result2) {
			if(err) {
				console.log("Idiocy");
			}
			var cDM = server.members.get(result[0].quest_DM);
			
			var characterNames = '';
			
			for(res in result2) {
				characterNames += result2[res].charName + " ";
			}
				
			
			message.author.send("${quest}\nQuest DM: ${cDM}\nQuest Level: ${result[0].quest_lvl}\nQuest Status: ${result[0].quest_status}\nActive Players: characterNames");
		});
	});
}

var message_members = function(args, message) {
	
	var text = args.splice(1).join(" ");

    //regEx to extract char names from 'text' string
    var regEx = /\W*(.*?)(?:,|$)/g;
    var match;

    console.log(text);
	var quest;
	var mesText = "";
	var counter = 0;
	while ((match = regEx.exec(text)[1]) != '') {
		if (counter == 0){
			quest = match;
		} else {
			mesText += match;
		}		
		counter++;
    }
	console.log(quest);
	con.query("SELECT * FROM quest_data WHERE quest_name=\'" + quest + "\';", function(err, result) {
		if(err) {
			console.log("Invalid quest");
		}
		if(result[0] == undefined) { 
            message.channel.send("No such quest with that title");
            return;
        }
		console.log(result);
		if(message.author.id != result[0].quest_DM) {
			message.channel.send("You are not the DM of that quest, and can't message the players.");
			return;
			
		}
		
		if(result[0] == undefined) {
			return;
		}
		var cUP = result[0].active_players.split(" ");
		var sql = "SELECT * FROM roster WHERE entryID=";
		for(var i = 0; i < cUP.length; i++) {
			if(i == 0) {
				sql += cUP[i];
			} else {
				sql+= " OR entryID=" + cUP[i];
			}
		}
		sql += ";";
		
		con.query(sql, function(err, result2) {
			if(err) {
				console.log("Idiocy");
			}
			
			for(entry in result2) {
				var playerUser = server.members.get(result2[entry].charPlayer);
				var DMName = message.author.username;
				playerUser.send("Message from " + DMName + " about the quest " + result[0].quest_name + ":\n" + mesText);
			}
			message.author.send("You sent to the players on " + result[0].quest_name + ":\n" + mesText);
			
		});
		
	});


}

var roll_dice = function (args, message) {
    //if no input return
    if (!/\dd\d/.test(args[1])) {
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
    message.channel.send(output);
    
}

var join_quest = function (args, message) {
    //sets message author 
    var auth = message.author;
    //no match found yet
    var found = false;
    //reads input arguments
    var text = args.splice(1).join(" ");

    //regEx to extract char names from 'text' string
    var regEx = /\W*(.*?),\W(.*?)$/;
    var match = regEx.exec(text);

    var quest = match[1];
    var character = match[2];
	
	//Queries to find the quest
	con.query("SELECT * FROM quest_data WHERE quest_name=\'" + quest + "\';", function(err, result) {
		if (err) {
			auth.send("No such quest with that title");
		}
		if(result[0] == undefined) {
			auth.send("No such quest sith that title");
			return;
		}
		//If its open and inactive, query to find the player
		if(result[0].quest_status != "CLOSED" && result[0].active != 1) {
			con.query("SELECT * FROM roster WHERE charName=\'" + character + "\';", function(err, result2){
				if(err || result2.length == 0) {
					auth.send("Invalid character");
					return;
				}				
				//Make sure they own the character or are a DM
				if(auth.id != result2[0].charPlayer && !server.members.get(auth.id).roles.find("name", "Dungeon Master")) {
					
					auth.send("That's not your character!");
					return;
					
				}
				//Set variables for the new values
				var qPlayersNew;
				//Makes sure no undefined problems occur with player counts
				if(result[0].active_players == '') {
					qPlayersNew = result2[0].entryID;
				} else {
					var checkP = result[0].active_players.split(" ");
					console.log(checkP);
					for(var i = 0; i < checkP.length; i++) {
						if(parseInt(checkP[i]) == result2[0].entryID) {
							auth.send("That character is already on the quest!");
							return;
						}
					}
					qPlayersNew = result[0].active_players + " " + result2[0].entryID;
				}
				var qTotNew = result[0].total_players + 1;
				var qStatNew;
				var questClosed = false;
				//If all spots full, closes the quest
				if (qTotNew == result[0].size) {
					qStatNew = "CLOSED";
					questClosed = true;
				} else {
					qStatNew = "OPEN ("+ qTotNew + "/" + result[0].size + ")";
				}
				//Updates the SQL
				var upquer = "UPDATE quest_data SET quest_status=\'" + qStatNew + "\', active_players=\'" + qPlayersNew + "\', total_players=" + qTotNew + " WHERE quest_name=\'" + quest + "\';";
				con.query(upquer, function(err, result3) {
					if (err) throw err;
					console.log("Quest updated");	
					auth.send("You've successfully joined " + quest + " with " + character + "!");
					var cDM = server.members.get(result[0].quest_DM);
					cDM.send(auth.username + " has joined " + quest + " with the character " + character + ".");
					if(questClosed == true) {
						cDM.send(quest + " is now full. Reach out to your players to schedule a session.");
					}
					quest_board.fetchMessage(result[0].message_id).then(message => {
						message.edit("**QUEST STATUS: " + qStatNew + "**");
					});
				});
				
			});
		}
		
	});
}

var leave_quest = function(args, message) {
	
	var auth = message.author;
    //reads input arguments
    var text = args.splice(1).join(" ");

    //regEx to extract char names from 'text' string
    var regEx = /\W*(.*?),\W(.*?)$/;
    var match = regEx.exec(text);

    var quest = match[1];
    var character = match[2];
	
	con.query("SELECT * FROM quest_data WHERE quest_name=${quest};", function(err, result) {
		if(err) {
			auth.send("Something went wrong. Try again in a couple of minutes.");
			return;
		}
		if(result == undefined) {
			auth.send("No quest by that name. Make sure the spelling is correct!");
			return;
		}
		
		con.query("SELECT * FROM roster WHERE charName=${character};", function(err, result2) {
			
			if(err) {
				auth.send("Something went wrong. Try again in a couple of minutes.");
				return;
			}
			if(result2 == undefined) {
				auth.send("No character by that name. Make sure the spelling is correct, and if you have a last name add it!");
				return;
			}
			if(auth.id != result2[0].charPlayer) {
				auth.send("That isn't your character, you can't remove them from the quest!");
				return;
			}
			
			//gets all of the players on the quest.
			var cPlayers = result[0].active_players.split(" ");
			if(!cPlayers.includes(result2[0].entryID)) {
				auth.send("That character isn't on this quest.");
			}
			//New values
			var qTotNew;
			var qPlayersNew = "";
			var reopened = false;
			var qStatnew;
			
			qTotNew = result[0].total_players - 1;
			for(pl in cPlayers) {
				if(cPlayers[pl] !== result2[0].entryID) {
					qPlayersNew += cPlayers[pl] + " ";
				}
			}
			//Check if quest is reopened
			if(result[0].total_players == result[0].size) {
				reopened = true;
			}
			qStatNew = "OPEN (${qTotNew}/${result[0].size})"
			
			//Updates the SQL
			var upquer = "UPDATE quest_data SET quest_status=\'" + qStatNew + "\', active_players=\'" + qPlayersNew + "\', total_players=" + qTotNew + " WHERE quest_name=\'" + quest + "\';";
			con.query(upquer, function(err, result3) {
				if (err) throw err;
				console.log("Quest updated");	
				auth.send("You've successfully removed " + character + " from " + quest + ".");
				var cDM = server.members.get(result[0].quest_DM);
				cDM.send(auth.username + " has removed the character " + character + " from " + quest + ".");
				if(reopened == true) {
					cDM.send(quest + " is now open again. Make sure to alert players if scheduling has already occurred.");
				}
				quest_board.fetchMessage(result[0].message_id).then(message => {
					message.edit("**QUEST STATUS: " + qStatNew + "**");
				});
			});
			
		});
	});		
			
}	

    //search all quest txt files **DEPRECATED
    /*fs.readdirSync(folder).forEach(file => {
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
                    server.members.forEach(member => {
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
    })
}*/
//Changes quest to active
var fire_quest = function(args, message) {
	
	var quest = args.splice(1).join(" ");
	
	con.query("SELECT * FROM quest_data WHERE quest_name=\'" + quest + "\';", function(err, result) {
		if(err) {
			message.channel.send("No quest by that title, sorry!");
			console.log(err);
		}
		if(result[0] == undefined) { 
                        message.channel.send("No such quest with that title");
                        return;
                }
		if(message.author.id !== result[0].quest_DM) {
			message.channel.send("You can't fire someone else's quest!");
			return;
		}
		
		if(result[0].total_players === 0) {
			message.channel.send("No players on that quest, cannot fire!");
			return;
		}
		
		//first, update the quest
		con.query("UPDATE quest_data SET active=1, quest_status='IN PROGRESS' WHERE quest_name=\'" + quest + "\';", function(err, result2) {
            if (err) throw err;

			//Second, update all the characters
			var cUP = result[0].active_players.split(" ");
			var sql = "UPDATE roster SET numQuests=numQuests + 1 WHERE entryID=";
			var sql2 = "SELECT * FROM roster WHERE entryID=";
			for(var i = 0; i < cUP.length; i++) {
				if(i == 0) {
					sql += cUP[i];
					sql2 += cUP[i];
				} else {
					sql+= " OR entryID=" + cUP[i];
					sql2+= " OR entryID=" + cUP[i];
				}
			}
			sql += ";";
			sql2 += ";";
			con.query(sql, function(err, result3) {
				if (err) {
					console.log("How the fuck");
					console.log(err);
				}
				con.query(sql2, function(err, result4) {
					if (err) {
						console.log(err);
					}
					message.channel.send(quest + " has fired.");
                    for (entry in result4) {
                        console.log();
                        var player = server.members.get(result4[entry].charPlayer);
                        player.send(result4[entry].charName + " is on a quest that has fired! Prepare them for " + quest + ".");
                    }

					quest_board.fetchMessage(result[0].message_id).then(message => {
						message.edit("**QUEST STATUS: IN PROGRESS**");
                    });
				});
				
			});
		});
		
	});
	
	
}

//Lists quests of a particular level
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
	
	//Reads SQL database to find quests of given level
	con.query("SELECT quest_name FROM quest_data WHERE quest_status!='CLOSED' AND quest_lvl=" + input + ";", function(err, result) {
		if (err) throw err ;
		console.log(result);
		for(entry in result) {
			try {
				auth.send(result[entry].quest_name);
			} catch(error){
				console.log(error);
			}
		}
		
	});
}

//Deprecated. Functionality now automatic.
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
        //var id = fs.readFileSync(__dirname + '/' + title + ".txt", 'utf8');

        //if quest complete, delete txt file
        //if (status.toLowerCase() == "complete") {
            //fs.unlinkSync(__dirname + '/' + title + ".txt");
        //}

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
    var regEx = /^\W*(?:"|“)(.*?)\W*(?:"|”) (.*?)$/gm;
    var match;
	
	
	var lvl;
	var size;
	

    while ((match = regEx.exec(text)) !== null) {
        //if "title" set as title
        if (match[1].toLowerCase() == "title") {
            listing.setTitle(match[2]);
        }
        //else create a new field for the header+text
        else {
            try {
                listing.addField(match[1], match[2], false);
				if(match[1].toLowerCase().trim() == "party level" || match[1].toLowerCase().trim() == "recommended level" || match[1].toLowerCase().trim() == "level") {
					lvl = parseInt(match[2]);
				} else if(match[1].toLowerCase().trim() == "party size" || match[1].toLowerCase().trim() == "size"){
					var numbers = match[2].match(/\d+/g).map(Number);
					size = numbers[numbers.length - 1];
					
				}
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

    console.log(listing.title);

    //allows for "test" quests
    if (listing.title.toLowerCase().trim() == "test") {
        message.channel.send("**QUEST STATUS: OPEN**", listing);
        return;
    }

	if(lvl == undefined || size == undefined ) {
		message.channel.send("Your quest needs a \"party size\" and \"party level\" field, or needs to have the title \"TEST\".");
		return;
	}

	var auth = message.author.id;
	
    //send embed w/ quest status text
    quest_board.send("**QUEST STATUS: OPEN**", listing)
        .then((message) => {

            //after message is sent, bot reads finds message id and stores as txt file
            console.log(message.id);

            //grab ID of message, and title of embed
            var id = message.id;
            var title = message.embeds[0].title;
			
			var queryText = "INSERT INTO quest_data (quest_name, quest_DM, quest_lvl, size, message_id) VALUES (\'" + title + "\', \'" + auth + "\', " + lvl + ", " + size + ", \'" + message.id + "\');";
			console.log(queryText);
			con.query(queryText, function(err){
				if(err) throw err ;
				console.log("1 Record inserted");
				
			});

            //create a file with name "title.txt" and content of the quest posting ID
            //fs.writeFileSync(__dirname + '/' + title + ".txt", id);
        });
		
	archive.send("**ARCHIVE COPY**", listing);
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

//searches database of spells and spits out description
var search_spells = function (args, message) {

    //if no arguments, return
    if (!args[1]) {
        return message.channel.send("Please give a spell");
    }

    //build spell name
    var spell_name = typeof (args) == "string" ? args : args.splice(1).join(" ");

    //search for spell by name in spell list
    for (spell in spell_list) {
        var current_spell = spell_list[spell];

        //if found, build spell description
        if (current_spell.name.toLowerCase() == spell_name.toLowerCase()) {
            var show_spell = new Discord.RichEmbed()
                .setColor([40, 110, 200])
                .setTitle(current_spell.name)
                .setThumbnail(bot.user.avatarURL);

            var spell_name_link = spell_name.replace(/ /g, "%20") + "_" + current_spell.source.replace(/ /g, "%20");

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

            show_spell.addField(`https://5etools.com/spells.html#${spell_name_link}`, spell_basics);

            var spell_components = "";
            if (current_spell.components.v) {
                spell_components += "verbal\n";
            }
            if (current_spell.components.s) {
                spell_components += "somatic\n";
            }
            if (current_spell.components.m) {
                spell_components += `material: ${current_spell.components.m}`;
            }

            if (spell_components == "") {
                spell_components = "none";
            }

            show_spell.addField("Components", spell_components);

            //spell casting time
            show_spell.addField("Casting Time", `${current_spell.time[0].number} ${current_spell.time[0].unit}`);

            var spell_range = "";

            if (current_spell.range.distance.amount) {
                spell_range += `${current_spell.range.distance.amount} ${current_spell.range.distance.type} (${current_spell.range.type})`;
            } else {
                spell_range += `${current_spell.range.distance.type} (${current_spell.range.type})`;
            }

            show_spell.addField("Range", spell_range);

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

            if (description.length > 2000) {
                var description_array = []
                var i = 0;
                while (description.length > 1000) {
                    description_array[i] = description.substring(0, 1000);
                    //console.log(description_array[i]);
                    i++;
                    description = description.substring(1000);
                }
                description_array[i] = description;
                show_spell.addField("Description", description_array[0]);

                //console.log(description_array);

                for (i = 1; i < description_array.length; i++) {
                    show_spell.addField("Description (cont.)", description_array[i]);
                }

            } else {
                show_spell.addField("Description", description);
            }

            for (extra in extras) {
                if (extra != 'undefined') {
                    show_spell.addField(extra, extras[extra]);
                }
            }


            message.channel.send(show_spell);

            return;
            
        }
        
    }

    message.channel.send("Spell not found. Please check spelling");

}

var roll_loot = function (args, message) {

    //checks to make sure there are enough arguments
    if (!args[2]) {
        return message.channel.send("Too few arguments");
    }

    //input form:
    //~loot [player name], [quantity of shards] 
    //doesn't care about line breaks. you can use them or not use them and the regex will be fine

    var text = args.splice(1).join(" ");

    //regEx to extract char names from 'text' string
    var regEx = /\W*(.*?),\W(.*?)$/;
    var match = regEx.exec(text);

    if(match[2] == null || match[2] == undefined) {
	message.channel.send("Invalid number of arguments.");
	return;
    }

    var char_name = match[1];
    var shards_used = parseInt(match[2]);

    if(shards_used == NaN) {
        message.channel.send("Invalid number of shards.");
	return;
    }

    if (!char_name || !shards_used) {
        return message.channel.send("Syntax or arguments error.");
    }
    
    var tier;

    if (shards_used >= 40) {
        shards_used = 40;
        tier = 6;
    } else if (shards_used >= 30) {
        shards_used = 30;
        tier = 5;
    } else if (shards_used >= 22) {
        shards_used = 22;
        tier = 4;
    } else if (shards_used >= 14) {
        shards_used = 14;
        tier = 3;
    } else if (shards_used >= 8) {
        shards_used = 8;
        tier = 2;
    } else if (shards_used >= 4) {
        shards_used = 4;
        tier = 1;
    } else if (shards_used >= 2) {
        shards_used = 2;
        tier = 0;
    } else {
        return message.channel.send("You need to spend at least 2 shards");
    }
    
    var player = message.author.id;
    
    //SQL call to verify they have neough, and then update quantity if they do
    var sql = "SELECT `riftShards` FROM `roster` WHERE `charPlayer`= '" + player + "' AND `charName` = '" + char_name + "'";

    con.query(sql, function (err, result) {
        if (err) throw err;
        if (result.length == 0) {
            return message.channel.send("no character/player found");
        }
        //gets characters DTH from results
        var shards_available = result[0].riftShards;

        //if they are trying to use too many, return
        if (shards_used > shards_available) {
            return message.channel.send("You don't have enough Rift Shards to do that.")
        }

        //CHOOSES WHAT TABLE TO ROLL LOOT FROM (SHOULD BE CHANGED TO REFLECT SHARDS USED)
        var table = loot_table[tier].table;

        //ROLLS A D100 FOR LOOT
        var d100 = parseInt(Math.random() * 100 + 1);

        //FINDS THE RESULT ON CORRECT TABLE
        for (var i = 0; i < table.length; i++) {
            if (table[i].min <= d100 & table[i].max >= d100) {

                var rolled_item = table[i].item;

                if (rolled_item.includes("Spell Scroll")) {

                    var lvl = 0;

                    if (!rolled_item.includes("Cantrip")) {
                        for (var lvl = 0; lvl < 10; lvl++) {
                            if (rolled_item.includes(lvl)) {
                                break;
                            }
                        }
                    }
                    var rand_spell;
                    do {
                        rand_spell = spell_list[parseInt(Math.random() * spell_list.length)];
                    } while (rand_spell.level != lvl);

                    rolled_item = rolled_item.replace(/\((.*?)\)/, `(${rand_spell.name})`);

                }

                message.bot_commands.send(`You spent ${shards_used} Rift Shards and The Curator gave you a ${rolled_item}`);

                search_items(table[i].item, message);
                if (rand_spell) {
                    search_spells(rand_spell.name, message);
                }
                break;
            }
        }

        //SQL to update character's dth
        var update = "UPDATE roster SET riftShards=riftShards - " + shards_used + " WHERE charName= '" + char_name + "'";
        con.query(update, function (err, result) {
            if (err) throw err;
            console.log("Updated");

        });

    });
    
}

var add_character = function (args, message) {


    //return if no arguments
    if (!args[1]) {
        return message.channel.send("Invalid number of arguments.");
		return;
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
                message.channel.send("Error adding character, check console for details.");
                return;
        }
        
    }

    //if not enough arguments, return
	if(outCats.length !== 3) {
		message.channel.send("Syntax error");
		return;
		
	}

    //gets key information
    var char_name = outCats[0];
    var player_name = outCats[1];
	var initial_xp = parseInt(outCats[2]);	
	var level = check_level(initial_xp);

    var player_id;
    var found_player_id = false;

    //searches for player's discord id in server members
    server.members.forEach(member => {
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
        return message.channel.send("no player found");
    }

    //build SQl string
	var sql = "INSERT INTO roster (charName, charPlayer, exp, downHours, riftShards, dead, edited, level) VALUES (\'" + char_name+ "\', \'" + player_id + "\', " + initial_xp + ", 0, 0, 0, 0, " + level + ")";

    //query SQL to add char to roster
    con.query(sql, function (err, result) {
		if (err) throw err;
        console.log("1 record inserted");
        console.log(result);
        server.members.get(player_id).send(`${char_name} was added to the guild`);
        general_chat.send(player_name + " has made a new character. Welcome to the guild, " + char_name + "!");
	});
    
}

//Manually add xp to certain players. Alerts Duncan when used as a failsafe against cheating.
var manual_xp = function (args, message) {

    //Requires at least 2 arguments
    if (!args[2]) {
        return message.channel.send("Not enough arguments");
    }

    //input form:
    //~addxp [xp value], [player1], [player2], [player3], ...
    //doesn't care about line breaks. you can use them or not use them and the regex will be fine

    //gets exp to be awarded from first argument
    var xp = parseInt(args[1]);

    //if an int value couldn't be parsed return
    if (!xp) {
        return message.channel.send("The experience value was incorrect");
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
        players.push(match);
    }

    //if no players, return
	if(players.length === 0){
		message.channel.send("Incorrect arguments, add players");
		return;	
	}

	award_xp(players, xp);
	
	//Sends duncan a message
	var dunc = server.members.get(duncan_id);
	dunc.send(message.author.username + " has just manually added XP. You may want to check in with them.");
	
}
//Closes a quest, which does the following:
// - Adds xp to all players on the quest in the amount specified
// - Deletes the quest from the SQL storage
var quest_complete = function(args, message) {

  	//Format ~complete  [quest name], [xp]
    text = args.splice(1).join(" ");

    var regEx = /\W*(.*?),\W(.*?)$/;
    var match = regEx.exec(text);

    var quest = match[1];
    var xp = parseInt(match[2]);
	
	
	con.query("SELECT * FROM quest_data WHERE quest_name=\'" + quest + "\';", function(err, result) {
		if (err) {
			message.channel.send("No such quest with that title");
		}
		if (result == undefined) { 
            auth.send("No such quest with that title");
            return;
        }
		
		if(message.author.id !== result[0].quest_DM) {
			message.channel.send("You can't complete someone else's quest!");
			return;
		}

        var auth = message.author;
		
		var cUP = result[0].active_players.split(" ");
		
		var sql = "UPDATE roster SET completeQuests=completeQuests + 1 WHERE entryID=";
		var sql2 = "SELECT * FROM roster WHERE entryID=";
		for(var i = 0; i < cUP.length; i++) {
			if(i == 0) {
				sql += cUP[i];
				sql2 += cUP[i];
			} else {
				sql+= " OR entryID=" + cUP[i];
				sql2+= " OR entryID=" + cUP[i];
			}
		}
		sql += ";";
		sql2 += ";";
		con.query(sql, function(err, result2) {
			if (err) {
				console.log("HOW " + err);
			}
			
			con.query(sql2, function(err, result3) {
				if(err) {
					console.log("WHAT FUCK");
					
                }
				var players = [];
				for(entry in result3) {
                    players.push(result3[entry].charName);
                    server.members.get(result3[entry].charPlayer).send(`${result[0].quest_name} was successfully completed with ${result3[entry].charName}.`);
				}
				award_xp(players, xp);
				
				quest_board.fetchMessage(result[0].message_id).then(message => {
						message.delete().then(msg => console.log("Message deleted")).catch(console.error);
				});
				
				con.query("DELETE FROM quest_data WHERE quest_name=\'" + quest + "\';", function(err, result4) {
					if(err) {
						console.log(err);
						
					}
					
					auth.send("Quest completed successfully!");
					
				});
				
			});

		});		
	
	});
}

var award_xp = function(players, xp) {
	
	//builds query to search for all players to be awarded exp		
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
        for (var i = 0; i < result.length; i++){
            console.log(result[i].charPlayer);
            var player = server.members.get(result[i].charPlayer);
            console.log(result[i]);
            player.send(`${result[i].charName} was awarded ${xp} XP. They now have ${result[i].exp + xp} XP.`);
			newLevel = check_level(parseInt(result[i].exp) + parseInt(xp));
            //if they leveled up, update database
			if (newLevel > parseInt(result[i].level)){
				con.query("UPDATE roster SET level=" + newLevel + " WHERE charName=\'" + result[i].charName + "\';", function(err, result2) {
					if (err) throw err;
					console.log("Level updated");
				});
				level_message(result[i].charName, result[i].charPlayer, newLevel);
            }
		}
			
	});
	
	
}

//GIVES PLAYERS SHARDS AFTER WEEKLY EVENT
var add_shards = function(args, message){

    //if Duncan isn't using the command, it is invalid
    console.log(message.author.username);
	if(message.author.id != duncan_id){
		message.channel.send("You do not have permission to use this command!");
		return;
	}

    //checks to make sure there are enough arguments
    if (!args[2]) {
        return message.channel.send("Too few arguments");
    }

    //input form:
    //~add_shards [quantity of shards], [player1 name], [player2 name],... 
    //doesn't care about line breaks. you can use them or not use them and the regex will be fine

    //gets exp to be awarded from first argument
    var shards = parseInt(args[1]);

    //if an int value couldn't be parsed return
    if (!shards) {
        return message.channel.send("The experience value was incorrect");
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
    	players.push(match);
    }

    //if no players, return
	if(players.length === 0){
		message.channel.send("Incorrect arguments, add players");
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

//Manual addition of hours for testing purposes
var add_hours = function(args, message){
	

    //if not Duncan, fuck off

	if(message.author.id != duncan_id){
		message.channel.send("You do not have permission to use this command!");
		return;
	}
	
    //gets exp to be awarded from first argument
    var hours = parseInt(args[1]);

    //if an int value couldn't be parsed return
    if (!hours) {
        return message.channel.send("The experience value was incorrect");
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
		message.channel.send("Incorrect arguments, add players");
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
        var output = `**${hours}** DTH have been given to `;
        for (var i = 0; i < players.length; i++) {
            output += `${players[i]}, `;
        }
        output = output.substring(0, output.length);
        bot_commands.send(output);
	});
	
}

var level_message = function(character, player, level){
	console.log(character + " " + " " + player + " " + level);
	var playerUser = server.members.get(player);
	
	playerUser.send("Congratulations, " + character + " has reached level " + level + "!");
	
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
        return message.channel.send("Too few arguments");
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
        return message.channel.send("Syntax or arguments error.");
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

    if (dth_quantity <= 0) {
        return message.channel.send("DTH expended must be positive.");
    }

    var player = message.author.id;

    //SQL call to verify they have neough, and then update quantity if they do
    var sql = "SELECT `downHours` FROM `roster` WHERE `charPlayer`= '" + player + "' AND `charName` = '" + char_name + "'";

    con.query(sql, function (err, result) {
        if (err) throw err;
        if (result.length == 0) {
            return message.channel.send("no character/player found");
        }
        //gets characters DTH from results
        var dth_available = result[0].downHours;

        //if they are trying to use too many, return
        if (dth_quantity > dth_available) {
            return message.channel.send("You don't have enough DTH to do that.")
        }

        if (parseInt(dth_use)) {
            bot_commands.send(`${char_name} has spent ${dth_quantity} hours work and and earned ${dth_quantity * 15} gp from your profession.`);
        }
        else {
            bot_commands.send(`${char_name} has spent ${dth_quantity} hours learning and picked up a new ${dth_use} proficiency.`);
        }

        //SQL to update character's dth
        var update = "UPDATE roster SET downHours=downHours - " + dth_quantity + " WHERE charName= '" + char_name + "'";
        con.query(update, function (err, result) {
            if (err) throw err;
            console.log("Updated");
			
        });
	
    });

}

//If the owner of the character or a DM asks, return the statistics
var check_character = function(args, message) {
	
	//Get name from args
	var character = args.splice(1).join(" ");
	
	con.query("SELECT * FROM roster WHERE charName=\'" + character + "\';", function(err, result) {
		if(err) throw err ;
		console.log(result);
		if(result[0] == undefined) {
			message.channel.send("No such character by that name!");
			return;
		}
		if(result[0].charPlayer == message.author.id || server.members.get(message.author.id).roles.find("name", "Dungeon Master")){
			message.channel.send("Character: " + result[0].charName + "\n Level: " + result[0].level + "\n XP: " + result[0].exp + "\n Downtime hours: " + result[0].downHours + "\n Rift Shards: " + result[0].riftShards);
			
			
		} else {
			message.channel.send("You do not have permission to view that character!");
		}
		
	});
	
}

//searches database of spells and spits out description
var search_items = function (args, message) {

    //if no arguments, return
    if (!args[1]) {
        return message.channel.send("Please give a spell");
    }

    //build spell name
    var item_name = typeof(args) == "string" ? args : args.splice(1).join(" ");

    console.log(item_name);
    
    //search for spell by name in spell list
    for (item in item_list) {
        var current_item = item_list[item];

        //if found, build spell description
        if (current_item.name.toLowerCase() == item_name.toLowerCase()) {
            var show_item = new Discord.RichEmbed()
                .setColor([40, 110, 200])
                .setTitle(current_item.name)
                .setThumbnail(bot.user.avatarURL);

            
            //builds a string of basic information on the spell
            var item_basics = "";
            
            var item_type_abreviations = {
                "$": "Precious Material",
                "A": "Ammunition",
                "AF": "Ammunition",
                "AT": "Artisan Tool",
                "EXP": "Explosive",
                "G": "Adventuring Gear",
                "GS": "Gaming Set",
                "HA": "Heavy Armor",
                "INS": "Instrument",
                "LA": "Light Armor",
                "M": "Melee Weapon",
                "MA": "Medium Armor",
                "MNT": "Mount",
                "GV": "Generic Variant",
                "P": "Potion",
                "R": "Ranged Weapon",
                "RD": "Rod",
                "RG": "Ring",
                "S": "Shield",
                "SC": "Scroll",
                "SCF": "Spellcasting Focus",
                "T": "Tool",
                "TAH": "Tack and Harness",
                "TG": "Trade Good",
                "VEH": "Vehicle",
                "SHP": "Vehicle",
                "WD": "Wand"
            };

            item_basics += current_item.wondrous ? `Type: *Wondrous Item` : `Type: *${item_type_abreviations[current_item.type]}`;

            if (current_item.type === "GV") {
                current_item = current_item.inherits;
            } 

            var item_name_link = item_name.replace(/ /g, "%20") + "_" + current_item.source.replace(/ /g, "%20");
            item_name_link = item_name_link.replace(/\,/g, "%2c");
            item_name_link = item_name_link.replace(/\+/g, "%2b");

            item_basics += current_item.tier ? `: ${current_item.tier}*\n` : '*\n';
            item_basics += current_item.value ? `Price: **${current_item.value}**\n` : "";
            item_basics += current_item.rarity ? `Rarity: ${current_item.rarity}\n` : "";
            item_basics += current_item.weight ? `Weight: ${current_item.weight}\n` : "";
            
            show_item.addField(`https://5etools.com/items.html#${item_name_link}`, item_basics);

            
            var description = "";
            var extras = {};

            for (entry in current_item.entries) {

                if (!current_item.entries[entry].type) {
                    description += `${current_item.entries[entry]}\n`;
                } else {
                    extras[current_item.entries[entry].name] = current_item.entries[entry].entries;
                }
            }

            if (description.length > 1000) {
                var description_array = []
                var i = 0;
                while (description.length > 1000) {
                    description_array[i] = description.substring(0, 1000);
                    //console.log(description_array[i]);
                    i++;
                    description = description.substring(1000);
                }
                description_array[i] = description;
                show_item.addField("Description", description_array[0]);

                //console.log(description_array);

                for (i = 1; i < description_array.length; i++) {
                    show_item.addField("Description (cont.)", description_array[i]);
                }

            } else {
                show_item.addField("Description", description);
            }

            for (extra in extras) {
                if (extra != 'undefined') {
                    show_item.addField(extra, extras[extra]);
                }
            }

            message.channel.send(show_item);

            return;

        }

    }

    message.channel.send("Item not found. Please check spelling");

}

//views the magic item shop inventory
var view_shop = function (args, message) {

    //selects all items from shop inventory
    var sql = "SELECT * FROM shop_inventory;";
    con.query(sql, function (err, result) {
        if (err) throw err;

        //preps output embed
        var shop_inventory = new Discord.RichEmbed()
            .setColor([40, 110, 200])
            .setTitle("Soots\'s Magic Item Shop")
            .setThumbnail(bot.user.avatarURL);

        var list = "";

        //adds all items a var for embed
        for (var item in result) {
            console.log(item);
            list += `**${result[item].item_name}** : ${result[item].item_price} gp\n`;
        }

        //if there were no items, say that
        if (list.length === 0) {
            list = "No items";
        }

        //adds list to embed and prints
        shop_inventory.addField("Item Name : price (gp)", list);
		shop_inventory.addField("Message a DM to buy an item.");
        message.channel.send(shop_inventory);

    });
    
}

//DM command to buy an item from shop
var buy_item = function (args, message) {

    var text = args.splice(1).join(" ");

    //regEx to extract char names from 'text' string
    var regEx = /\W*(.*?),\W(.*?)$/;
    var match = regEx.exec(text);

    //form of [char buying item], [item to buy]
    var char_name = match[1];
    var item_to_buy = match[2];

    //looks for item in shop inventory
    var sql = `SELECT * FROM shop_inventory WHERE item_name = '${item_to_buy}';`;
    con.query(sql, function (err, result) {
        if (err) throw err;

        if (!result || result.length == 0) {
            return message.channel.send("Item not found");
        }

        //if item is there, remove it from the inventory
        var remove_item_sql = `DELETE FROM shop_inventory WHERE item_name = '${item_to_buy}';`;        

        con.query(remove_item_sql, function (err, delete_result) {
            if (err) throw err;

            //message that the item was bought for expected price
            return bot_commands.send(`**${item_to_buy}** was bought by **${char_name}** for **${result[0].item_price} gp**`);

        });

    });

}

//Shows a list of approved homebrews and uploads the JSON file
var show_homebrew = function (args, message) {

    //create embed
    var homebrew_embed = new Discord.RichEmbed()
        .setColor([40, 110, 200])
        .setTitle("Approved Homebrew")
        .setThumbnail(bot.user.avatarURL);

    //JSON version number
    homebrew_embed.addField("Version", homebrew_list["_meta"]["sources"][0].version);

    //For all types of homebrew (race, class, ect)
    for (var type in homebrew_list) {
        //ignore the _meta heading
        if (type !== "_meta") {

            var items = "";
            //get all items of the specified type of homebrew
            for (var item in homebrew_list[type]) {

                items += `${homebrew_list[type][item].name} \n`
            }
            //add type of homebrew to embed
            homebrew_embed.addField(type, items);
        }
    }
    //Sends message with embed, basic instructions and JSON file
    message.channel.send("Add the json file to 5etools homebrew to see the following approved homebrews. Detailed instructions in FAQ.", { embed: homebrew_embed, file: './approved-homebrew.json' });

}

//rolls a character stat array with guild rules
var roll_char = function (args, message) {

    //creates array to hold stats
    var stats = [];

    //rolls until there are 6 stats with scores 7 or greater
    while (stats.length < 6) {

        var roll = []
        for (var i = 0; i < 4; i++) {
            roll.push(parseInt(Math.random() * 6 + 1));
        }
        var stat = roll.reduce((prev_value, curr_value) => prev_value + curr_value) - Math.min.apply(null, roll);

        console.log(stat);

        if (stat > 6) {
            stats.push(stat);
        }
    }

    //sorts the stats
    stats.sort((a, b) => b - a);

    //rerolls the greatest 4 stats until they are 10 or greater
    for (var i = 0; i < 4; i++) {

        while (stats[i] < 10) {

            var roll = []
            for (var j = 0; j < 4; j++) {
                roll.push(parseInt(Math.random() * 6 + 1));
            }
            var stat = roll.reduce((prev_value, curr_value) => prev_value + curr_value) - Math.min.apply(null, roll);

            stats[i] = stat;   
        }
    }

    //resorts the stats
    stats.sort((a, b) => b - a);

    //preps output and sends message
    var output = `<@${message.author.id}> rolled a character and got:\n`;
    for (var i = 0; i < 6; i++) {
        output += `**${(i+1)}:** ${stats[i]} \n`;
    }
    bot_commands.send(output);

}


var list_guild = function (args, message) {

    var sql = `SELECT * FROM roster WHERE 1`;

    con.query(sql, function (err, result) {
        if (err) throw err;

        var output = "**__GUILD ROSTER__**\n__**Character**, level__\n";

        for (var i = 0; i < result.length; i++) {
            output += `**${result[i].charName}**, ${result[i].level}\n`;
        }
        message.channel.send(output);

    });
    
}
