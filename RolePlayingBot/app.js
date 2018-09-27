/*
Title: RP Bot
Description: Posts quest listings for a D&D adventurers guild campaign
Version: 3.1.0
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
const chris_id = '190248534925246464';
const announcement_id = '438049253969887253';
const bot_commands_id = '441609746475122688';
const dm_bot_commands_id = '467439381083586560';
const general_id = '438048843674943498';
const party_channels = ['438107822149074979', '438107859553746950', '438107902683643917'];
var quest_board;
var archive;
var server;
var complete_board;
var announcement_board;
var bot_commands;
var dm_bot_commands;
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
item_list.push.apply(item_list, require('./basicitems.json').basicitem);

//Weekly xp tables
const rest_thresholds = [[4,20], [8,15], [12, 10], [17, 8], [20, 5], [29, 1]];

var homebrew_list = require('./approved-homebrew.json');

const folder = './';

var con;
var pool;

var dateA;

console.logCopy = console.log.bind(console);

console.log = function (data) {
    var timestamp = `[${new Date().toUTCString()}]`;
    this.logCopy(timestamp, data);
};


//when ready, log in console
var on_ready = bot.on("ready", () => {

    quest_board = bot.channels.get(quest_board_id);
	announcement_board = bot.channels.get(announcement_id);
	archive = bot.channels.get(archive_id);
    server = quest_board.guild;
	complete_board = bot.channels.get(complete_board_id);
    bot_commands = bot.channels.get(bot_commands_id);
    dm_bot_commands = bot.channels.get(dm_bot_commands_id);
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
//	setTimeout(lockout_warning, adjustedTime - (30 * 60 * 1000));	
//	setTimeout(weekly_progress, adjustedTime);
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

    
    pool.getConnection(function (err, connection) {

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
        var args = message.content.substring(prefix.length).split(" ").filter(arg => arg != '');

        if (message.channel != bot_commands && message.channel != dm_bot_commands && message.channel.type != 'dm') {
            if (args[0].toLowerCase() !== "roll" && args[0].toLowerCase() !== "r") {
				con.release();
				return message.author.send("You need to DM me or use the #bot-commands channel.");
			} else {
				if(!party_channels.includes(message.channel.id)) {
					con.release();
					return message.author.send("You can only roll in #bot-commands or the party channels.");
				}
			}
        }

        //Lets people use quest command with "title" on newline WITHOUT a space after quest (which would otherwise make args[0] = 'quest\n"title"' and not let it work)        
        var quest_spacing = args[0].match(/quest\s(\".*)/);
        if (quest_spacing != null) {

            args.splice(0, 1, "quest");
            args.splice(1, 0, quest_spacing[1]);

        }
		

		//read message arguments
        switch (args[0].toLowerCase()) {

            //Spends a player's DTH 
            case "spenddth":
			case "dth":

				spend_dth(args, message);
				con.release();
				return;

			//rolls X dice with Y sides
			//takes input of form: XdY [+Z]
            case "rolldice":
            case "r":
			case "roll":

				roll_dice(args, message);
				con.release();
				return;

			//PM's the DM to join their quest and updates SQL
            case "joinquest":
			case "join":
				join_quest(args, message);
				con.release();
				return;

            //Lists the information about a particular quest
            case "checkquest":

                check_quest(args, message);
                con.release();
                return;

            //Lets a player leave a quest (NOT BUG TESTED)
            case "leavequest":
			case "leave":
				leave_quest(args,message);
				con.release();
				return;

			//List quests of particular level
            case "listquests":
            case "list":

                list_quests(args, message);
		        con.release();
                return;

            //Displays information about an item
			case "item":

				search_items(args, message);
				con.release();
				return;

            //Rolls a magic item for the specified player based on shards spent
            case "spendshards":
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
            case "checkchar":
            case "checkcharacter":
            case "char":
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
            case "viewshop":
            case "shop":

                view_shop(args, message);
                con.release();
                return;

            //Rolls a character stat array based on guild rules
            case "rollstats":
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
                    .addField('~check [character name]', 'Lists the stats and resources for the specified character. For DMs and owners for the character only.')
					.addField('~checkquest [quest title]', 'Sends you the name, level, DM, and active players on a given quest.')
                    .addField('~join [quest title], [character]', 'Sends a message to the DM that you want to join their quest, and adds your character to the quest.')
                    .addField('~leave [quest title], [character]', 'Removes your character from a quest that they\'re on and notifies the DM.')
					.addField('~spell [spell name]', 'Sends you a message displaying the details of the requested spell')
					.addField('~homebrew', 'Posts the current approved homebrew json file. Use the manage homebrew option on 5etools to view it.')
                    .addField('~dth [character], [use/number]', 'Spends downtime hours for either a use or a number for professions. Check the FAQ for details.')
					.addField('~shards [character], [shards spent]', 'Rolls loot for you on the Shard Loot table based on the shards spent. Check the FAQ for details. The bot will automatically round down to the nearest table breakpoint.')
                    .addField('~item [item name]', 'Sends you a message displaying the details of the requested item.')
					.addField('~shop', 'Shows you the current inventory of Soots\'s Magic Item Shop')
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

			//creates a new quest posting
            case "newquest":
            case "addquest":
			case "quest":
				
				new_quest(args, message);

				break;

			//sets bot "playing" status
			case "botstatus":

				update_bot_status(args, message);

				break;

			//command to test bot responsiveness, sends a response to the log
            case "test":
            case "ping":

				message.channel.send("ping!");
				console.log("PING");
				break;
				
			//command to add a character to the guild roster
            case "addchar":
            case "addcharacter":
            case "newchar":
            case "newcharacter":
			case "character":
				
				add_character(args, message);
				
				break;

            //completes a quest and awards XP to the players on the quest
            case "completequest":
			case "complete":
				quest_complete(args, message);
				
				break;

            //manual add XP command (should be used with caution), notifies Duncan
            case "addxp":
            case "manualxp":
            case "xp":
				
				manual_xp(args, message);
				
				break;

            //duncan's (and neal's?) 
            //command to give rift shards after weeklies
			case "addshards":
			
				add_shards(args, message);
				
				break;

            //DUNCAN ONLY
            //manual function to award end of week DTH 
            case "adddth":
			case "addhours":
			
				add_hours(args, message);
				
				break;

            //launches a quest and sets it's status to "active"
            case "firequest":
            case "launch": 
            case "launchquest":
            case "start":
            case "startquest":
			case "fire":
				
				fire_quest(args, message);
				
                break;

            case "editquest":

                edit_quest(args, message);

                break;

            case "repostquest":

                repost_quest(args, message);

                break;
            //lets a DM to buy an item for a player from Soot's Shop
            case "buy":
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

                if (message.author.id == duncan_id|| message.author.id == chris_id) {
					weekly_progress();
				} else {
                    message.channel.send("You are not Duncan, heathen!");
                }

                break;

            case "randitem":
            case "shopitem":

                if (message.author.id == chris_id) {
                    rand_shop_item(args, message);
                } else {
                    message.channel.send("You are not Chris, heathen!");
                }
                break;
                

            //lists the guild's roster
            case "guildroster":
            case "roster":

                list_guild(args, message);
                break;


			//if not a valid command, note it
			default:

				message.channel.send("~" + args[0] + " is not a valid command. Use ~help for a list of commands.");
				
				break;

            //self explanitory
			case "help":

				//embed of Quest Giver bot commands
				var commands = new Discord.RichEmbed()
					.setColor([40, 110, 200])
					.setTitle("RPBot Dungeon Master Commands:")
                    .addField('~quest', '"title" TITLE \n "level" [party level] \n "size" [party size] \n\n*All quests must have a "title", "level", and "size". To test the formatting of your quest listing, make the title **TEST**.*')
                    .addField('~messagequest [quest name], [message text]', 'Message all the players on a quest you are running a particular message. Only works if you are the DM of that quest.')
                    .addField('~fire [quest name]', 'Launches the specified quest, sets its status to IN PROGRESS, and notifies players on the quest.')
                    .addField('~complete [quest name], [xp awarded]', 'Closes a quest and awards experience to players on the quest')
                    .addField('~addxp [xp awarded], [character 1], [character2]', 'awards exp to the specified players. Only use this command if you mess up. Alerts Duunko whenever you use it.')
                    .addField('~character [new character name], [player\'s username], [starting xp]','Makes a new character for the specified player.')
                    .addField('~buyitem [char buying], [item name]', 'Lets the player buy the item at price and removes it from the shop. Players cannot buy items without DM permission')
                    .addField('~roster', 'Lists the entire guild roster and each character\'s level.')
					.addField('~botstatus [new status]', 'sets the status of the bot.')
                    .addField('~test', 'Prints a "ping!" to confirm the bot is working.')
					.setThumbnail(bot.user.avatarURL);
				message.channel.send(commands);

		}
	con.release();
	});
});

var keepAlive = function () {
    console.log("keep alive activated");
    pool.getConnection(function (err, connection) {
        if (err) { return; }
        connection.query("SELECT 1", function (err, rows) {
            connection.release();
            if (err) {
                console.log("Keep alive error: " + err);
            } else {
                console.log("Keep alive successful");
            }
        });
    });
    setTimeout(keepAlive, 6 * 60 * 60 * 1000);
}

var bot_status_to_revert;

var lockout_warning = function () {

    bot_status_to_revert = "Done";
	announcement_board.send("Weekly downtime in 30 minutes. Make sure that all finished quests have been closed with ~complete or you may lose downtime rewards.");
    bot.user.setGame("Lockout 4AM PST");
    bot.user.setStatus("idle");
    console.log("lockout warning sent, bot status updated.");
}

var weekly_progress = function () {

    console.log("Lockout beginning, bot status updated. Updates in progress.");
    lockout = true;
    bot.user.setGame("Lockout in Progress");
    bot.user.setStatus("dnd");
	var fullHours = [];
	var halfHours = [];
	pool.getConnection(function(err,connection) {
		if (err) throw err ;
		con = connection;
		var con2;
		pool.getConnection(function(err, connection2) {
			if(err) {
				console.log("Connection Error: " + err);
				return;
			}
			con2 = connection2;
			con2.query("SELECT * FROM roster", function(err, result) {
				if (err) {
                    console.log("Weekly Updates Error (results1): " + err);
					throw err;
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
							//Messages the player\
                                                        console.log("Messaging user with id" + result[entry].charPlayer);
							var play = server.members.get(result[entry].charPlayer);
							play.send(result[entry].charName + " got " + xpTotal + " experience and 20 Downtime Hours for their restful week.");
							award_xp(player, xpTotal);
							
							break;
							
						case 1:
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
				var sql = `UPDATE roster SET downHours=downHours+20 WHERE entryID IN ("`;
				for(var i = 0; i < fullHours.length; i++) {
					sql+= fullHours[i] + `", "`;
                }
                sql = sql.substring(0, sql.length - 3) + ");";

                var sql2 = `UPDATE roster SET downHours=downHours+10 WHERE entryID IN ("`;
                for (var i = 0; i < halfHours.length; i++) {
					sql2+= halfHours[i] + `", "`;					
                }
                sql2 = sql2.substring(0, sql2.length - 3) + ");";

                con2.query(sql, function (err, result2) {
					if(err) {
                        console.log("Weekly Updates Error (results2): " + err);
                        throw err;
					}
					
					con2.query(sql2, function(err, result3) {
						if(err) {
                            console.log("Weekly Updates Error (results3): " + err);
                            throw err;
						}
						
						con2.query("UPDATE roster SET numQuests= numQuests - completeQuests, completeQuests = 0", function(err, result4) {
							if (err) {
                                console.log("Weekly Updates Error (results4): " + err);
                                throw err;
							}
                            lockout = false;
                            announcement_board.send("Weekly downtime Complete.");
                            bot.user.setGame(bot_status_to_revert);
                            bot.user.setStatus("online");
                            console.log("Lockout complete, updates successful.");
						});
					});
					
				});
			});
			con2.release();
		});
		con.release();
    });	
    setTimeout(lockout_warning, 7 * 24 * 60 * 60 * 1000);
    setTimeout(weekly_progress, (7 * 24 * 60 * 60 * 1000) - (30 * 60 * 1000));							
}

var check_quest = function (args, message) {

    if (!args[1]) {
        console.log("No arguments provided for check_quest.");
        message.channel.send("The syntax for 'check' is '~checkquest [quest name]'.");
        return;
    }

    var quest = args.splice(1).join(" ");
    console.log(`checking quest, ${quest}`);

	con.query(`SELECT * FROM quest_data WHERE quest_name="${quest}";`, function(err, result) {
		if(err) {
			message.channel.send("Something went wrong. Try again in a couple of minutes.");
		}
		if(result[0] == undefined) {
			message.channel.send("No such quest by that name. Check and make sure you spelled everything correctly and try again!");
			return;
		}
		
		if(result[0].active_players == '') {
			message.channel.send(`${quest}\nQuest DM: ${result[0].quest_DM}\nQuest Level: ${result[0].quest_lvl}\nQuest Status: ${result[0].quest_status}\nActive Players: None`);
			return;
			
		}
		
        var cUP = result[0].active_players.trim().replace(/\s+/g, ' ').split(" ");
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
				console.log(err);
			}
			var cDM = server.members.get(result[0].quest_DM);
			
			var characterNames = '';

            for (res in result2) {
                characterNames += `${result2[res].charName} (${result2[res].level}), `;
            }
            characterNames = characterNames.substring(0, characterNames.length - 2);
				
			
            message.channel.send(`${quest}\nQuest DM: ${cDM}\nQuest Level: ${result[0].quest_lvl}\nQuest Status: ${result[0].quest_status}\nActive Players: ${characterNames}`);
            console.log(`Quest checked.`);

		});
    });
}

var message_members = function (args, message) {

    if (!args[1]) {
        console.log("No arguments provided for ~messagequest.");
        message.channel.send("The syntax for ~messagequest is '~messagequest [quest name], [message]'.")
    }
	
	var text = args.splice(1).join(" ");

    //regEx to extract char names from 'text' string
    var regEx = /\W*(.*?)(?:,|$)/g;
    var match;

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

    if (!quest || mesText.length == 0) {
        console.log("Invalid arguments or no message given.");
        message.channel.send("Invalid arguments or no message given. The syntax for 'messagequest' is '~messagequest [quest name], [message]'.");
        return;
    }

    console.log(`Messaging members of ${quest}.`);

    con.query(`SELECT * FROM quest_data WHERE quest_name="${quest}";`, function (err, result) {
		if(err) {
            console.log("SQL error.");
            console.log(err);
            return;
		}
        if (result.length == 0) {
            console.log("No quest found");
            message.channel.send("No such quest with that title");
            return;
        }
		//console.log(result);
        if (message.author.id != result[0].quest_DM) {
            console.log("Author isn't DM of the requested quest.");
			message.channel.send("You are not the DM of that quest so you can't message the players.");
			return;
		}
		
        var cUP = result[0].active_players.trim().replace(/\s+/g, ' ').split(" ");
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
                console.log("SQL error (result2): " + err);
                return;
			}
			
			for(entry in result2) {
				var playerUser = server.members.get(result2[entry].charPlayer);
				var DMName = message.author.username;
				playerUser.send("Message from " + DMName + " about the quest " + result[0].quest_name + ":\n" + mesText);
			}
			message.author.send("You sent to the players on " + result[0].quest_name + ":\n" + mesText);
            console.log("Messaging complete");
			
		});
		
	});

}

var roll_dice = function (args, message) {
    //if no input return
    if (!/\dd\d/.test(args[1])) {
        message.channel.send("Roll takes in  ~roll [X]d[Y] as arguments, with [X] and [Y] the number of dice to roll and how many faces to roll.\nTo add a modifier add +[Z] or -[Z].\nTo keep high/low dice use [X]d[Y]h[n] to keep the highest 'n' dice and [X]d[Y]l[n] to keep the lowest 'n' dice.");
        console.log("Wrong/no arguments for ~roll.");
        return;
    }

    //no match found yet
    var found = false;
    //reads input arguments
    var text = args.splice(1).join(" ");

    //regEx to extract char names from 'text' string
    var regEx = /\W*(.*?)(?:,|$)/g;
    var str = regEx.exec(text)[1].replace(/\s/g, "").toLowerCase();
    var purpose = regEx.exec(text)[1];

    if (!str) {
        console.log("Invalid arguments for ~roll");
        message.channel.send("Invalid arguments. The syntax for 'roll' is '~roll [X]d[Y]+/-[Z], [roll purpose (optional)]'. For more details, use '~roll'.");
        return;
    }

    console.log(`Rolling Dice`);

    const mods = [];

    str = str.replace(/(([+-]+)\d+)(?=[^d]|$)|(([+-]+|^)\d+$)|(([+-]+|^)\d+(?=[+-]))/g, (m0) => {
        mods.push(m0);
        return "";
    });

    function cleanOperators(str) {
        let len;
        let nextLen;
        do {
            len = str.length;
            str = str.replace(/--/g, "+").replace(/\+\++/g, "+").replace(/-\+/g, "-").replace(/\+-/g, "-");
            nextLen = str.length;
        } while (len !== nextLen);
        return str;
    }

    const totalMods = mods.map(m => Number(cleanOperators(m))).reduce((a, b) => a + b, 0);

    function isNumber(char) {
        return char >= "0" && char <= "9";
    }

    function getNew() {
        return {
            neg: false,
            num: 1,
            faces: 20
        };
    }

    const S_INIT = -1;
    const S_NONE = 0;
    const S_COUNT = 1;
    const S_FACES = 2;

    const stack = [];

    let state = str.length ? S_NONE : S_INIT;
    let cur = getNew();
    let temp = "";
    let c;
    let keep = false;

    for (let i = 0; i < str.length; ++i) {
        c = str.charAt(i);
        switch (state) {
            case S_NONE:
                if (c === "-") {
                    cur.neg = !cur.neg;
                } else if (isNumber(c)) {
                    temp += c;
                    state = S_COUNT;
                } else if (c === "d") {
                    state = S_FACES;
                } else if (c !== "+") {
                    return null;
                }
                break;
            case S_COUNT:
                if (isNumber(c)) {
                    temp += c;
                } else if (c === "d") {
                    if (temp) {
                        cur.num = Number(temp);
                        temp = "";
                    }
                    state = S_FACES;
                } else {
                    return null;
                }
                break;
            case S_FACES:
                if (isNumber(c)) {
                    temp += c;
                } else if (c === "l") {
                    cur.keeps = "l";
                    if (temp) {
                        keep = true;
                        cur.faces = Number(temp);
                        if (!cur.num || !cur.faces) return null;
                        temp = "";
                    } 
                } else if (c === "h") {
                    cur.keeps = "h";
                    if (temp) {
                        keep = true;
                        cur.faces = Number(temp);
                        if (!cur.num || !cur.faces) return null;
                        temp = "";
                    }
                } else if (c === "+" || c === "-") {
                    if (temp) {
                        if (keep) cur.keep = Number(temp);
                        else cur.faces = Number(temp);

                        if (!cur.num || !cur.faces || (cur.keep && (cur.keep >= cur.num))) return null;
                        stack.push(cur);
                        cur = getNew();
                        if (c === "-") cur.neg = true;
                        temp = "";
                        state = S_NONE;
                    } else {
                        return null;
                    }
                } else {
                    return null;
                }
                break;
        }
    }
    switch (state) {
        case S_NONE:
            return null;
        case S_COUNT:
            return null;
        case S_FACES:
            if (temp) {
                if (keep) cur.keep = Number(temp);
                else cur.faces = Number(temp);
                if (cur.keep && (cur.keep >= cur.num)) return null;
            } else {
                return null;
            }
            break;
    }

    if (state !== S_INIT) {
        if (!cur.num || !cur.faces) return null;
        stack.push(cur);
    }

    var parsed = {dice: stack};

    let rolls = [];

    function rollDice(count, faces) {
        const out = [];
        for (let i = 0; i < count; ++i) {
            out.push(Math.ceil(Math.random() * faces));
        }
        return out;
    }

    rolls = parsed.dice.map(d => {
        function dropRolls(r) {
            if (!d.keeps) return [r, []];
            if (d.keeps === "l") {
                r.sort((a, b) => a - b);
            } else if (d.keeps === "h") {
                r.sort((a, b) => b - a);
            }
            const toDrop = r.slice(d.keep, r.length);
            const keepStack = [];
            const dropStack = [];
            r.forEach(it => {
                const di = toDrop.indexOf(it);
                if (~di) {
                    toDrop.splice(di, 1);
                    dropStack.push(it);
                } else {
                    keepStack.push(it);
                }
            });
            return [keepStack, dropStack];
        }

        var r = rollDice(d.num, d.faces);
        const [keepR, dropR] = dropRolls(r);

        const total = keepR.reduce((a, b) => a + b, 0);
        //const max = d.keep ? d.keep * d.faces : d.num*d.faces;
        //const min = d.keep ? d.keep : d.num;
        return {
            rolls: keepR,
            dropped: dropR.length ? dropR : null,
            total: (-(d.neg || -1)) * total,
            //isMax: total === max,
            //isMin: total === min, // i.e. all 1's
            neg: d.neg,
            num: d.num,
            faces: d.faces,
            keep: d.keep,
            keeps: d.keeps
        }
    });

    var totalRoll = totalMods;
    for (var roll in rolls) {
        totalRoll += rolls[roll].total;
    }

    //begins to build output string
    var output = `<@${message.author.id}> rolled `;

    var toAdd = "";
    for (var roll in rolls) {
        toAdd += rolls[roll].neg ? `- ` : `+ `;
        toAdd += rolls[roll].keep ? `${rolls[roll].num}d${rolls[roll].faces}${rolls[roll].keeps}${rolls[roll].keep} ` : `${rolls[roll].num}d${rolls[roll].faces} `;
    }

    output += rolls[0].neg ? toAdd : toAdd.substring(2);
    if (totalMods > 0) {
        output += `+ ${totalMods}`;
    } else if (totalMods < 0) {
        output += `- ${totalMods*-1}`;
    }

    output += purpose ? ` for **${purpose}** and got:` : " and got:";
    toAdd = "";
    for (var i = 0; i < rolls.length; i++) {
        toAdd += rolls[i].neg ? ` - (` : ` + (`;
        for (var j = 0; j < rolls[i].rolls.length; j++) {
            toAdd += `${rolls[i].rolls[j]} + `
        }

        if (rolls[i].dropped) {
            toAdd += `~~`;
            for (var j = 0; j < rolls[i].dropped.length; j++) {
                toAdd += `${rolls[i].dropped[j]} + `
            }
            toAdd = toAdd.substring(0, toAdd.length - 3) + "~~)";
        } else {
            toAdd = toAdd.substring(0, toAdd.length - 3) + ")";
        }
    }

    output += rolls[0].neg ? toAdd : toAdd.substring(2);
    if (totalMods > 0) {
        output += ` + ${totalMods}`;
    } else if (totalMods < 0) {
        output += ` - ${totalMods * -1}`;
    }
    output += ` = ${totalRoll}`;

    //sends result as a reply to sender
    message.channel.send(output);
    console.log("Roll complete");

}

var join_quest = function (args, message) {

    if (!args[1]) {
        console.log("No arguments provided for ~join.");
        message.channel.send("The syntax for 'join' is '~join [quest title], [character name]'.");
        return;
    }

    //sets message author 
    var auth = message.author;
    //no match found yet
    var found = false;
    //reads input arguments
    var text = args.splice(1).join(" ");

    //check if DM is making the command as a proxy for another user
    var dm_proxy = false;

    //regEx to extract char names from 'text' string
    var regEx = /\s*(.*?),\s(.*?)$/;
    var match = regEx.exec(text);

    if (!match || match.length < 2) {
        console.log("Invalid arguments for ~join");
        message.channel.send("Invalid arguments. The syntax for 'join' is '~join [quest title], [character name]'.");
        return;
    }

    var quest = match[1];
    var character = match[2];

    console.log(`${character} attempting to join ${quest}.`);

	//Queries to find the quest
	con.query(`SELECT * FROM quest_data WHERE quest_name="${quest}";`, function(err, result) {
		if (err) {
            console.log("SQL error (result1): " + err);
            message.channel.send("SQL error, please try again in a few minutes.");
            return;
		}
		if(result[0] == undefined) {
            message.channel.send("No such quest with that title. Please check spelling.");
            console.log(`${quest} was not found.`);
			return;
        }

        if (result[0].active) {
            message.channel.send("The quest has already launched. You can't join it.");
            console.log("The quest has already fired. Join failed.");
            return;
        }

		//If its open and inactive, query to find the player
		if(result[0].quest_status != "CLOSED" && result[0].active != 1) {
			con.query(`SELECT * FROM roster WHERE charName="${character}";`, function(err, result2){
                if (err) {
                    console.log("SQL error (result2): " + err);
                    message.channel.send("SQL error, please try again in a few minutes.");
                    return;
                }

                if (result2.length == 0) {
                    message.channel.send("The character was not found. Please check spelling.");
                    console.log(`${character} was not found.`)
                    return;
                }

				//Make sure they own the character or are a DM
                
				if(auth.id != result2[0].charPlayer) {

                    if (server.members.get(auth.id).roles.find("name", "Dungeon Master")) {
                        dm_proxy = true;
                    }
                    else {
                        message.channel.send("That's not your character!");
                        console.log('Author is not a DM and doesn\'t own that character');
                        return;
                    }
					
				}
				//Set variables for the new values
				var qPlayersNew;
				//Makes sure no undefined problems occur with player counts
				if(result[0].active_players == '') {
					qPlayersNew = result2[0].entryID;
				} else {
					var checkP = result[0].active_players.split(" ");

                    for (var i = 0; i < checkP.length; i++) {
                        if (parseInt(checkP[i]) == result2[0].entryID) {
                            message.channel.send("That character is already on the quest!");
                            console.log(`The character was already on the quest`);
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
				var upquer = `UPDATE quest_data SET quest_status="${qStatNew}", active_players="${qPlayersNew}", total_players= ${qTotNew} WHERE quest_name="${quest}";`;
				con.query(upquer, function(err, result3) {
                    if (err) {
                        console.log("SQL error (result3): " + err);
                        message.channel.send("SQL error, please try again in a few minutes.");
                        return;
                    }

                    var cDM = server.members.get(result[0].quest_DM);
                    if (dm_proxy) {
                        message.channel.send(character + " has successfully joined " + quest + "!");
                        var proxied_player = server.members.get(result2[0].charPlayer);
                        proxied_player.send(`Your character, ${character}, was added to ${quest} by ${auth.username}`);
                        cDM.send(`${proxied_player} has joined ${quest} with the character ${character}. (${auth.username} proxied).`)
                    }
                    else {
                        message.channel.send("You've successfully joined " + quest + " with " + character + "!");
                        cDM.send(auth.username + " has joined " + quest + " with the character " + character + ".");
                    
                    }
					if(questClosed == true) {
						cDM.send(quest + " is now full. Reach out to your players to schedule a session.");
					}
					quest_board.fetchMessage(result[0].message_id).then(message => {
                        message.edit("**QUEST STATUS: " + qStatNew + "**");
                        console.log("Quest updated, character added and quest posting editted.");
					});
				});
				
			});
		}
		
	});
}

var leave_quest = function(args, message) {

    if (!args[1]) {
        console.log("No arguments for ~leave");
        message.channel.send("The syntax for 'leave' is '~leave [quest title], [character name]'.");
        return;
    }

    var dm_proxy = false;
	var auth = message.author;
    //reads input arguments
    var text = args.splice(1).join(" ");

    //regEx to extract char names from 'text' string
    var regEx = /\W*(.*?),\W(.*?)$/;
    var match = regEx.exec(text);

    if (!match || match.length < 2) {
        console.log("Invalid arguments for ~leave");
        message.channel.send("Invalid arguments. The syntax for 'leave' is '~leave [quest title], [character name]'.");
        return;
    }

    var quest = match[1];
    var character = match[2];

    console.log(`${character} is attempting to leave ${quest}`);

	con.query(`SELECT * FROM quest_data WHERE quest_name="${quest}";`, function(err, result) {
        if (err) {
            console.log("SQL error (result1): " + err);
			message.channel.send("Something went wrong. Try again in a couple of minutes.");
			return;
        }
        if (result == undefined || result.length == 0) {
            message.channel.send("No quest by that name. Make sure the spelling is correct!");
            console.log(`${quest} not found.`);
			return;
		}
		
		con.query(`SELECT * FROM roster WHERE charName="${character}";`, function(err, result2) {
            if (err) {
                console.log("SQL error (result2): " + err);
                message.channel.send("Something went wrong. Try again in a couple of minutes.");
				return;
            }
            if (result2 == undefined || result2.length == 0) {
                message.channel.send("No character by that name. Make sure the spelling is correct, and if you have a last name add it!");
                console.log(`${character} not found.`);
				return;
            }

            if (auth.id != result2[0].charPlayer) {

                if (server.members.get(auth.id).roles.find("name", "Dungeon Master")) {
                    dm_proxy = true;
                }
                else {
                    message.channel.send("That's not your character!");
                    console.log('Author is not a DM and doesn\'t own that character');
                    return;
                }

            }
			
			//gets all of the players on the quest.
            var cPlayers = result[0].active_players.split(' ');

            if (!cPlayers.includes(result2[0].entryID.toString())) {
                console.log("Player wasn't on the quest");
                message.channel.send("That character isn't on this quest.");
                return;
            }

			//New values
			var qTotNew;
			var qPlayersNew = "";
			var reopened = false;
			var qStatnew;
			
			qTotNew = result[0].total_players - 1;
            for (pl in cPlayers) {
                if (cPlayers[pl] !== result2[0].entryID.toString() && cPlayers[pl] !== '') {
                    console.log(cPlayers[pl]);
					qPlayersNew += cPlayers[pl] + ' ';
				}
            }

			//Check if quest is reopened
			if(result[0].total_players == result[0].size) {
				reopened = true;
			}
			qStatNew = result[0].active ? `IN PROGRESS` : `OPEN (${qTotNew}/${result[0].size})`;

			//Updates the SQL
			var upquer = `UPDATE quest_data SET quest_status="${qStatNew}", active_players="${qPlayersNew}", total_players= ${qTotNew} WHERE quest_name="${quest}";`;

            con.query(upquer, function (err, result3) {
                if (err) {
                    console.log("SQL error (result3): " + err);
                    message.channel.send("SQL error, try again in a few minutes");
                    return;
                }
                if (result[0].active) {
                    var leave_active_quest_sql = `UPDATE roster SET completeQuests=completeQuests + 1 WHERE entryID = ${result2[0].entryID}`;
                    con.query(leave_active_quest_sql, result4, function (err, result4) {
                        if (err) {
                            console.log("SQL error (result4): " + err);
                            message.channel.send("SQL error, try again in a few minutes");
                            return;
                        }
                    });
                }

                var cDM = server.members.get(result[0].quest_DM);
                if (dm_proxy) {
                    message.channel.send(character + " has left " + quest + "!");
                    var proxied_player = server.members.get(result2[0].charPlayer);
                    proxied_player.send(`Your character, ${character}, was removed from ${quest} by ${auth.username}`);
                    cDM.send(`${proxied_player} has left ${quest} with the character ${character}. (${auth.username} proxied).`)
                }
                else {
                    message.channel.send("You've successfully left " + quest + " with " + character + ".");
                    cDM.send(auth.username + " has left " + quest + " with the character " + character + ".");

                }
				if(reopened == true) {
					cDM.send(quest + " is now open again. Make sure to alert players if scheduling has already occurred.");
				}
				quest_board.fetchMessage(result[0].message_id).then(message => {
                    message.edit("**QUEST STATUS: " + qStatNew + "**");
                    console.log("Quest updated, character was removed and quest posting editted");	
				});
			});
		});
	});		
			
}	

//Changes quest to active
var fire_quest = function(args, message) {

    if (!args[1]) {
        console.log("No arguments for ~fire");
        message.channel.send("The syntax for 'fire' is '~fire [quest title]'.");
        return;
    }

	var quest = args.splice(1).join(" ");

    console.log(`Attempting to fire quest, ${quest}`);

	con.query(`SELECT * FROM quest_data WHERE quest_name="${quest}";`, function(err, result) {
		if(err) {
			message.channel.send("There was an error. Please try again in a few minutes or notify a DM.");
            console.log("SQL error (result1): " + err);
            return;
        }

		if(result[0] == undefined) { 
            message.channel.send("No such quest with that title");
            console.log(`${quest} wasn't found.`);
            return;
        }

		if(message.author.id !== result[0].quest_DM) {
            message.channel.send("You can't fire someone else's quest!");
            console.log(`Quest owned by another DM`);
			return;
		}
		
		if(result[0].total_players === 0) {
            message.channel.send("No players on that quest, cannot fire!");
            console.log(`No players were on quest. Fire unsuccessful.`);
			return;
		}
		
		//first, update the quest
		con.query(`UPDATE quest_data SET active=1, quest_status="IN PROGRESS" WHERE quest_name="${quest}";`, function(err, result2) {
            if (err) {
                console.log("SQL error (result2): " + err);
                message.channel.send("SQL error, try again in a few minutes");
                return;
            }
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
                    console.log("SQL error (result3): " + err);
                    console.log(sql);
                    message.channel.send("SQL error, try again in a few minutes");
                    return;
				}
				con.query(sql2, function(err, result4) {
					if (err) {
                        console.log("SQL error (result4): " + err);
                        message.channel.send("SQL error, try again in a few minutes");
                        return;
					}
					message.channel.send(quest + " has fired.");

                    for (entry in result4) {
                        var player = server.members.get(result4[entry].charPlayer);
                        player.send(result4[entry].charName + " is on a quest that has fired! Prepare them for " + quest + ".");
                    }

					quest_board.fetchMessage(result[0].message_id).then(message => {
                        message.edit("**QUEST STATUS: IN PROGRESS**");
                        console.log(`Quest fired, players notified.`);
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

    if (!args[1]) {
        console.log("No arguments for ~list");
        message.channel.send("The syntax for 'list' is '~list [quest's level]'.")
        return;
    }

    //read argument
    var input = args[1];

    //turn input into a regex expression to search for level requirements
    var inReg = new RegExp("(\W|^)" + input + "(\W|$)");

    if (!parseInt(input)) {
        console.log("Quest level input could not be parsed for ~list");
        message.channel.send("The level could not be parsed. Make sure the syntax is correct and the argument is an integer.");
    }

    console.log(`Listing open quests of lvl ${input}`);

    //prep the message
    message.channel.send("**Open quests of level " + input + ": **");
	
	//Reads SQL database to find quests of given level
	con.query(`SELECT quest_name FROM quest_data WHERE quest_status!="CLOSED" AND quest_status!="IN PROGRESS" AND quest_lvl=${input};`, function(err, result) {
        if (err) {
            console.log("SQL error (result): " + err);
            message.channel.send("SQL error, try again in a few minutes");
            return;
        }
        for (entry in result) {
            message.channel.send(result[entry].quest_name);
        }

        console.log("Finished");
    });
    
}

var new_quest = function (args, message) {
    //creates embed for quest listing
    var listing = new Discord.RichEmbed().
        setAuthor(message.author.username).
        setThumbnail(message.author.avatarURL);

    if (!args[1]) {
        console.log("No arguments for ~quest");
        message.channel.send('The syntax for \'quest\' is ```~quest\n"Title" [quest title]\n"Level" [quest level]\n"party size" [Party Size]\n"Description" [quest description]```');
        return;
    }

    //combines input into a single string for regex
    var text = args.splice(1).join(" ");

    //searches for new lines and seperates headers from texts
    var regEx = /^\W*(?:"|“)(.*?)\W*(?:"|”) (.*?)$/gm;
    var match;

    console.log("Attempting to make a new quest");
	
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
        console.log("There was no title for the quest");
        return;
    }

    //allows for "test" quests
    if (listing.title.toLowerCase().trim() == "test") {
        message.channel.send("**QUEST STATUS: OPEN**", listing);
        console.log("The quest was a test. Example output printed");
        return;
    }

	if(lvl == undefined || size == undefined ) {
        message.channel.send("Your quest needs a \"party size\" and \"party level\" field, or needs to have the title \"TEST\".");
        console.log("Level or Party fields were missing");
		return;
	}

	var auth = message.author.id;
	
    //send embed w/ quest status text
    quest_board.send("**QUEST STATUS: OPEN**", listing)
        .then((message) => {

            //grab ID of message, and title of embed
            var id = message.id;
            var title = message.embeds[0].title;
			
			var queryText = `INSERT INTO quest_data (quest_name, quest_DM, quest_lvl, size, message_id) VALUES ("${title}", "${auth}", ${lvl}, ${size}, "${message.id}");`;

            con.query(queryText, function (err) {
                if (err) {
                    console.log("SQL error: " + err);
                    message.channel.send("SQL error, try again in a few minutes");
                    return;
                }
                console.log(`${title} added to SQL data`);
                message.channel.send("Quest added to board.");

			});

        });
		
    archive.send("**ARCHIVE COPY**", listing);
}


var update_bot_status = function (args, message) {
    //if there's no arguments, return
    if (!args[1]) {
        console.log("No arguments for ~botstatus");
        message.channel.send("The syntax for 'botstatus' is '~botstatus [new status]'.");
        return;
    }

    //read arguments
    var text = args.splice(1).join(" ");

    //set status
    bot.user.setGame(text);
    console.log("Bot status Updated.");
    message.channel.send("Bot status updated to: " + text);
}

//searches database of spells and spits out description
var search_spells = function (args, message) {

    //if no arguments, return
    if (!args[1]) {
        console.log("No arguments for ~spell");
        return message.channel.send("The syntax for 'spell' is '~spell [spell name]'.");
    }

    //build spell name
    var spell_name = typeof (args) == "string" ? args : args.splice(1).join(" ");

    console.log(`Searching for the Spell ${spell_name}`);

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
                    i++;
                    description = description.substring(1000);
                }
                description_array[i] = description;
                show_spell.addField("Description", description_array[0]);

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
            console.log(`Spell found, printing info`);
            return;
            
        }
        
    }
    console.log(`No spell by that name found`);
    message.channel.send("Spell not found. Please check spelling");

}

var roll_loot = function (args, message) {

    //checks to make sure there are enough arguments
    if (!args[1]) {
        console.log("No arguments for ~shards");
        message.channel.send("The syntax for 'shards' is '~shards [player name], [shards used]'. The Shard breakpoints are listed in the FAQs. The number of shards used will round down to the next breakpoint.");
        return;
    }

    //input form:
    //~loot [player name], [quantity of shards] 
    //doesn't care about line breaks. you can use them or not use them and the regex will be fine

    var text = args.splice(1).join(" ");

    //regEx to extract char names from 'text' string
    var regEx = /\W*(.*?),\W(.*?)$/;
    var match = regEx.exec(text);

    if (!match || match.length < 2 || parseInt(match[2]) == NaN) {
        console.log("Invalid arguments for ~shards.");
        message.channel.send(`Invalid arguments. The syntax for 'shards' is '~shards [player name], [shards used]'. The Shard breakpoints are listed in the FAQs. The number of shards used will round down to the next breakpoint.`);
	    return;
    }
    
    var char_name = match[1];
    var shards_used = parseInt(match[2]);
    
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
        console.log("Shards spent was less than 2");
        return message.channel.send("You need to spend at least 2 shards");
    }
    
    var player = message.author.id;
    
    //SQL call to verify they have neough, and then update quantity if they do
    var sql = `SELECT riftShards FROM roster WHERE charPlayer= "${player}" AND charName= "${char_name}"`;

    con.query(sql, function (err, result) {
        if (err) {
            console.log("SQL error (result1): " + err);
            message.channel.send("SQL error, try again in a few minutes");
            return;
        }

        if (result.length == 0) {
            console.log("Player wasn't found");
            return message.channel.send("no character/player found");
        }
        //gets characters DTH from results
        var shards_available = result[0].riftShards;

        //if they are trying to use too many, return
        if (shards_used > shards_available) {
            console.log("Player doesn't have enough shards to do that.");
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
        var update = `UPDATE roster SET riftShards=riftShards - ${shards_used} WHERE charName= "${char_name}"`;
        con.query(update, function (err, result2) {
            if (err) {
                console.log("SQL error (result2): " + err);
                message.channel.send("SQL error, try again in a few minutes");
                return;
            }
            console.log(`${char_name} spent ${shards_used} shards and rolled a ${rolled_item}`);
        });

    });
    
}

var add_character = function (args, message) {
    
    //return if no arguments
    if (!args[1]) {
        console.log("No arguments for ~character");
        return message.channel.send("The syntax for 'character' is '~character [new character name], [player's name], [starting exp]'.");
    }

    console.log("Attempting to add a character to the guild roster.");

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
            console.log("Error in matching: " + e);
            message.channel.send("Error adding character, check console for details.");
            return;
        }
        
    }

    //if not enough arguments, return
    if (outCats.length !== 3) {
        console.log("Syntax error.");
        message.channel.send("Syntax error. The syntax for 'character' is '~character [new character name], [player's name], [starting exp]'.");
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
        console.log(`No player ${player_name} found.`);
        return message.channel.send("no player found");
    }

    //build SQl string
    var sql = `INSERT INTO roster (charName, charPlayer, exp, downHours, riftShards, dead, edited, level) VALUES ("${char_name}", "${player_id}", ${initial_xp}, 0, 0, 0, 0, ${level})`;

    //query SQL to add char to roster
    con.query(sql, function (err, result) {
        if (err) {
            console.log("SQL error: " + err);
            message.channel.send("SQL error, try again in a few minutes");
            return;
        }
        server.members.get(player_id).send(`${char_name} was added to the guild`);
        general_chat.send(`<@${player_id}> has made a new character. Welcome to the guild, ${char_name}!`);
        console.log("Player successfully added.");
	});
    
}

//Manually add xp to certain players. Alerts Duncan when used as a failsafe against cheating.
var manual_xp = function (args, message) {

    //Requires at least 2 arguments
    if (!args[1]) {
        console.log("No arguments for ~addxp.");
        return message.channel.send("The syntax for 'addxp' is '~addxp [xp value], [char 1], [char 2], [char 3]' for as many characters as you need.");
    }

    console.log(`MANUAL EXP attempted by ${message.author.username}`);

    //input form:
    //~addxp [xp value], [player1], [player2], [player3], ...
    //doesn't care about line breaks. you can use them or not use them and the regex will be fine

    //gets exp to be awarded from first argument
    var xp = parseInt(args[1]);

    //if an int value couldn't be parsed return
    if (!xp) {
        console.log(`Experience value, ${xp}, was not parsed.`);
        return message.channel.send("Invalid syntax, the experience value was not parsed. The syntax for 'addxp' is '~addxp [xp value], [char 1], [char 2], [char 3]' for as many characters as you need.");
    }

    //starts at args[2] to ignore the experience value in args[1]
    var text = args.splice(2).join(" ");

    //regEx to extract char names from 'text' string
    var regEx = /\W*(.*?)(?:,|$)/g;
    var match;

    var players = [];
    
    //grabs all char names from 'text'
    while ((match = regEx.exec(text)[1]) != '') {
        players.push(match);
    }

    //if no players, return
    if (players.length === 0) {
        console.log("No players specified");
        message.channel.send("Invalid syntax, no characters selected. The syntax for 'addxp' is '~addxp [xp value], [char 1], [char 2], [char 3]' for as many characters as you need.");
		return;	
	}

	award_xp(players, xp);
	
	//Sends duncan a message
	var dunc = server.members.get(duncan_id);
    //dunc.send(message.author.username + " has just manually added XP. You may want to check in with them.");
    message.channel.send("Experience added.");
    console.log("Manual exp success");
}
//Closes a quest, which does the following:
// - Adds xp to all players on the quest in the amount specified
// - Deletes the quest from the SQL storage
var quest_complete = function(args, message) {

    if (!args[1]) {
        console.log("No arguments for ~complete");
        message.channel.send("The syntax for 'complete' is '~complete [quest title], [xp awarded]'.");
        return;
    }

  	//Format ~complete  [quest name], [xp]
    text = args.splice(1).join(" ");

    var regEx = /\s*(.*?),\s(.*?)$/;
    var match = regEx.exec(text);

    if (!match || match.length < 2 || !parseInt(match[2])) {
        console.log("Invalid arguments for ~complete");
        message.channel.send("Invalid syntax. The syntax for 'complete' is '~complete [quest title], [xp awarded]'.");
        return;
    }

    var quest = match[1];
    var xp = parseInt(match[2]);

    console.log(`Completing quest ${quest}`);

	con.query(`SELECT * FROM quest_data WHERE quest_name="${quest}";`, function(err, result) {
        if (err) {
            console.log("SQL error (result): " + err);
            message.channel.send("SQL error, try again in a few minutes");
            return;
		}
        if (result == undefined) {
            console.log(`No quest with that name found`);
            message.channel.send("No such quest with that title");
            return;
        }
		
        if (message.author.id !== result[0].quest_DM) {
            console.log(`Wrong DM of quest.`);
			message.channel.send("You can't complete someone else's quest!");
			return;
        }

        if (!result[0].active) {
            console.log("Quest hasn't been started yet.");
            message.channel.send("You must fire the quest before you complete it!");
            return;
        }

        var auth = message.author;
		
        var cUP = result[0].active_players.trim().replace(/\s+/g, ' ').split(" ");
		
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
                console.log("SQL error (result2): " + err);
                message.channel.send("SQL error, try again in a few minutes");
                return;			}
			
			con.query(sql2, function(err, result3) {
				if(err) {
                    console.log("SQL error (result3): " + err);
                    message.channel.send("SQL error, try again in a few minutes");
                    return;                }
				var players = [];
				for(entry in result3) {
                    players.push(result3[entry].charName);
                    server.members.get(result3[entry].charPlayer).send(`${result[0].quest_name} was successfully completed with ${result3[entry].charName}.`);
				}
				award_xp(players, xp);
				
				quest_board.fetchMessage(result[0].message_id).then(message => {
						message.delete().then(msg => console.log("Quest posting deleted")).catch(console.log(error));
				});
				
				con.query(`DELETE FROM quest_data WHERE quest_name="${quest}";`, function(err, result4) {
					if(err) {
                        console.log("SQL error (result4): " + err);
                        message.channel.send("SQL error, try again in a few minutes");
                        return;
					}
					
                    message.channel.send("Quest completed successfully!");
                    console.log("Quest completed, exp awarded");
					
				});
				
			});

		});		
	
	});
}

var award_xp = function(players, xp) {

    console.log("Awarding exp to a (group?) of players.");

	//builds query to search for all players to be awarded exp		
	var quer1 = `SELECT exp, level, charName, charPlayer FROM roster WHERE charName IN ("`;
	for(var i = 0; i < players.length; i++){
		quer1 += players[i] + `"`;
		if(i + 1 != players.length){
			quer1 += `, "`;
		}
	}
	quer1 += ");"

    //builds query to update their exp
	var sql = `UPDATE roster SET exp=exp + ${xp}, edited=1 WHERE charName IN ("`;
	for(var i = 0; i < players.length; i++){
		sql += players[i] + `"`;
		if(i + 1 != players.length){
			sql += `, "`;
		}
	}
	sql += ");"

    //SQL query to make sure there are no errors
	con.query(quer1, function (err, result, fields) {
        if (err) throw err;

        //if no errors, award exp
		con.query(sql, function (err, resultX) {
            if (err) {
                console.log("SQL error (resultX) : " + err);
                message.channel.send("SQL error, try again in a few minutes");
                return;
            }
			console.log("Exp awarded");
        });		

        //check to see if anyone leveled up
        for (var i = 0; i < result.length; i++){
            var player = server.members.get(result[i].charPlayer);

            player.send(`${result[i].charName} was awarded ${xp} XP. They now have ${result[i].exp + xp} XP.`);
			newLevel = check_level(parseInt(result[i].exp) + parseInt(xp));
            //if they leveled up, update database
            if (newLevel > parseInt(result[i].level)) {
				con.query(`UPDATE roster SET level= ${newLevel} WHERE charName= "${result[i].charName}";`, function(err, result2) {
                    if (err) throw err;

				});
				level_message(result[i].charName, result[i].charPlayer, newLevel);
            }
		}
        console.log(`EXP awarding successful`);
			
	});

	
}

//GIVES PLAYERS SHARDS AFTER WEEKLY EVENT
var add_shards = function(args, message){

    //if Duncan isn't using the command, it is invalid
    if (message.author.id != duncan_id && message.author.id != chris_id) {
        console.log("Not duncan trying to add shards.");
        message.channel.send("You do not have permission to use this command!");
        return;
    }

    //checks to make sure there are enough arguments
    if (!args[1]) {
        console.log("No arguments for ~addshards.");
        return message.channel.send("The syntax for 'addshards' is '~addshards [shards to add], [character 1], [character 2]' for as many characters as necessary.");
    }

    console.log("Attempting to add shards");

    //input form:
    //~addshards [quantity of shards], [player1 name], [player2 name],... 
    //doesn't care about line breaks. you can use them or not use them and the regex will be fine

    //gets exp to be awarded from first argument
    var shards = parseInt(args[1]);

    //if an int value couldn't be parsed return
    if (!shards) {
        console.log("Shards did not parse correctly.")
        return message.channel.send("The shards didn't parse. The syntax for 'addshards' is '~addshards [shards to add], [character 1], [character 2]' for as many characters as necessary.");
    }

    //starts at args[2] to ignore the experience value in args[1]
    var text = args.splice(2).join(" ");

    //regEx to extract char names from 'text' string
    var regEx = /\s*(.*?)(?:,|$)/g;
    var match;

    var players = [];
	
	//grabs all players to be given shards
	while ((match = regEx.exec(text)[1]) != '') {
    	players.push(match);
    }

    //if no players, return
    if (players.length === 0) {
        console.log("No players selected");
        message.channel.send("Incorrect arguments, add players. The syntax for 'addshards' is '~addshards [shards to add], [character 1], [character 2]' for as many characters as necessary.");
		return;	
	}

    //builds sql query to update all players shards
	var sql = `UPDATE roster SET riftShards=riftShards + ${shards}, edited=1 WHERE charName IN ("`;
	for(var i = 0; i < players.length; i++){
		sql += players[i] + `"`;
		if(i + 1 != players.length){
			sql += `, "`;
		}
	}
	sql += ");"
	
    //SQL updates player information
	con.query(sql, function (err, result) {
        if (err) {
            console.log("SQL error: " + err);
            message.channel.send("SQL error, try again in a few minutes");
            return;
        }
        console.log("Shards awarded successfully.");
        message.channel.send("Shards awarded.");
		});
	
}

//Manual addition of hours for testing purposes
var add_hours = function(args, message){

    //if not Duncan, fuck off

    if (message.author.id != duncan_id) {
        console.log("Not duncan trying to manually add DTH.");
        message.channel.send("You do not have permission to use this command!");
        return;
    }

    if (!args[1]) {
        console.log("No arguments for ~addhours");
        message.channel.send("The syntax for 'addhours' is '~addhours [hours added] [character 1], [character 2]' for as many characters as desired.");
        return;
    }

    console.log("Attempting to add DTH hours manually");
    //gets exp to be awarded from first argument
    var hours = parseInt(args[1]);

    //if an int value couldn't be parsed return
    if (hours == NaN) {
        console.log("DTH quantity did not parse.")
        return message.channel.send("Invalid syntax, DTH awarded did not parse. The syntax for 'addhours' is '~addhours [hours added] [character 1], [character 2]' for as many characters as desired.");
    }

    //starts at args[2] to ignore the experience value in args[1]
    var text = args.splice(2).join(" ");

    //regEx to extract char names from 'text' string
    var regEx = /\s*(.*?)(?:,|$)/g;
    var match;

    var players = [];

	while ((match = regEx.exec(text)[1]) != "") {
        players.push(match);        
    }
	
    if (players.length === 0) {
        console.log("No players selected.");
        message.channel.send("Incorrect arguments, add players. The syntax for 'addhours' is '~addhours [hours added], [character 1], [character 2]' for as many characters as desired.");
		return;	
	}
	
	var sql = `UPDATE roster SET downHours=downHours + ${hours}, edited=1 WHERE charName IN ("`;
    var notify_sql = `SELECT charPlayer FROM roster WHERE charName IN ("`;
    for (var i = 0; i < players.length; i++){
        sql += players[i] + `"`;
        notify_sql += players[i] + `"`;
		if(i + 1 != players.length){
            sql += `, "`;
            notify_sql += `, "`;
		}
	}
	sql += ");"
    notify_sql += ");";
	
    con.query(sql, function (err, result) {
        if (err) {
            console.log("SQL error (result1): " + err);
            message.channel.send("SQL error, try again in a few minutes");
            return;
        }
        var output = `**${hours} DTH** have been given to `;

        con.query(notify_sql, function (err, result2) {
            if (err) {
                console.log("SQL error (result2): " + err);
                message.channel.send("SQL error, try again in a few minutes");
                return;
            }
            for (var i = 0; i < result2.length; i++) {
                output += `${players[i]}, `;
                var char_player = server.members.get(result2[i].charPlayer);
                char_player.send(`Your character ${players[i]} was awarded ${hours} DTH.`);
            }
            output = output.substring(0, output.length-2);
            message.channel.send(output);

            console.log("DTH successfully awarded.");

        });
	});
	
}

var level_message = function(character, player, level){
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
    if (!args[1]) {
        console.log("No arguments for ~dth");
        return message.channel.send("The syntax for 'dth' is '~dth [character name], [use/quantity of DTH spent]'.");
    }

    //input form:
    //~spendDTH [player name], [use/quantity of DTH] 
    //doesn't care about line breaks. you can use them or not use them and the regex will be fine

    var text = args.splice(1).join(" ");

    //regEx to extract char names from 'text' string
    var regEx = /\s*(.*?),\s(.*?)$/;
    var match = regEx.exec(text);

    if (!match || match.length < 2) {
        console.log(`Invalid syntax or arguments`);
        return message.channel.send("Syntax or arguments error. The syntax for 'dth' is '~dth [character name], [use/quantity of DTH spent]'.");
    }

    var char_name = match[1];
    var dth_use = match[2];

    console.log(`${char_name} attempting to spend DTH.`)

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
    var sql = `SELECT downHours FROM roster WHERE charPlayer= "${player}" AND charName = "${char_name}"`;

    con.query(sql, function (err, result) {
        if (err) throw err;
        if (result.length == 0) {
            console.log("Player was not found.");
            return message.channel.send("no character/player found");
        }
        //gets characters DTH from results
        var dth_available = result[0].downHours;

        //if they are trying to use too many, return
        if (dth_quantity > dth_available) {
            console.log(`The character didn't have enough DTH`);
            return message.channel.send("You don't have enough DTH to do that.")
        }


        //SQL to update character's dth
        var update = `UPDATE roster SET downHours=downHours - ${dth_quantity} WHERE charName= "${char_name}"`;
        con.query(update, function (err, result) {
            if (err) {
                console.log("SQL error (result) : " + err);
                message.channel.send("SQL error, try again in a few minutes");
                return;
            }

            if (parseInt(dth_use)) {
                bot_commands.send(`${char_name} has spent ${dth_quantity} hours work and earned ${dth_quantity * 8} gp from their profession.`);
            }
            else {
                bot_commands.send(`${char_name} has spent ${dth_quantity} hours learning and picked up a new ${dth_use} proficiency.`);
            }

            if (message.channel != bot_commands) {
                message.channel.send("Hours spent, check bot-commands.");
            }

            console.log(`DTH used, SQL updated.`);
			
        });
	
    });

}

//If the owner of the character or a DM asks, return the statistics
var check_character = function(args, message) {

    if (!args[1]) {
        console.log("No arguments for ~check");
        message.channel.send("The syntax for 'check' is '~check [character name]'.");
        return;
    }

	//Get name from args
	var character = args.splice(1).join(" ");

    console.log(`Checking ${character}'s stats.`);

	con.query(`SELECT * FROM roster WHERE charName="${character}";`, function(err, result) {
        if (err) {
            console.log("SQL error (result1) : " + err);
            message.channel.send("SQL error, try again in a few minutes");
            return;            
        }
		//console.log(result);
        if (result[0] == undefined) {
            console.log("No character found.");
			message.channel.send("No such character by that name!");
			return;
        }

        con.query(`SELECT quest_name FROM quest_data WHERE active_players LIKE "%${result[0].entryID}%";`, function (err, result2) {
            if (err) {
                console.log("SQL error (result2) : " + err);
                message.channel.send("SQL error, try again in a few minutes");
                return;                
            }

            if (result[0].charPlayer == message.author.id || server.members.get(message.author.id).roles.find("name", "Dungeon Master")) {

                var output = "Character: " + result[0].charName + "\n Level: " + result[0].level + "\n XP: " + result[0].exp + "\n Downtime hours: " + result[0].downHours + "\n Rift Shards: " + result[0].riftShards + "\n Quests this Week: " + result[0].completeQuests + "\n Active Quests: ";
                if (result2[0] == undefined || result2[0].length == 0) {
                    message.channel.send(output + "none");
                } else {
                    for (var quest in result2) {
                        output += `${result2[quest].quest_name}, `;
                    }
                    message.channel.send(output.substring(0, output.length-2));
                }
                console.log("Stats printed");

            } else {
                console.log("Author doesn't own the player");
                message.channel.send("You do not have permission to view that character!");
            }
        });
		
	});
	
}

//searches database of spells and spits out description
var search_items = function (args, message) {

    //if no arguments, return
    if (!args[1]) {
        console.log("No arguments for ~item");
        return message.channel.send("The syntax for 'item' is '~item [item name]'.");
    }

    //build spell name
    var item_name = typeof(args) == "string" ? args : args.splice(1).join(" ");

    console.log(`Searching for ${item_name}.`);
    
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


            item_basics += current_item.tier ? `: ${current_item.tier}*\n` : '*\n';
            item_basics += current_item.value ? `Price: **${current_item.value}**\n` : "";
            item_basics += current_item.rarity ? `Rarity: ${current_item.rarity}\n` : "";
            item_basics += current_item.weight ? `Weight: ${current_item.weight}\n` : "";

            if (current_item.source == "AGHB") {
                show_item.addField(`Homebrew item`, item_basics);

            } else {
                var item_name_link = item_name.replace(/ /g, "%20") + "_" + current_item.source.replace(/ /g, "%20").replace(/\,/g, "%2c").replace(/\+/g, "%2b");
                show_item.addField(`https://5etools.com/items.html#${item_name_link}`, item_basics);
            }


            
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
                    
                    i++;
                    description = description.substring(1000);
                }
                description_array[i] = description;
                show_item.addField("Description", description_array[0]);


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
            console.log("Item found, details printed");
            return;

        }

    }

    message.channel.send("Item not found. Please check spelling");
    console.log("Item not found.");
}

//views the magic item shop inventory
var view_shop = function (args, message) {

    console.log("Accessing Soot's shop.");

    //selects all items from shop inventory
    var sql = "SELECT * FROM shop_inventory;";
    con.query(sql, function (err, result) {
        if (err) {
            console.log("SQL error (result) : " + err);
            message.channel.send("SQL error, try again in a few minutes");
            return;
        }

        //preps output embed
        var shop_inventory = new Discord.RichEmbed()
            .setColor([40, 110, 200])
            .setTitle("__Soots\'s Magic Item Shop__")
            .setThumbnail(bot.user.avatarURL);

        var list = "";

        //adds all items a var for embed
        for (var item in result) {
            if (result[item].item_quantity > 0) {
                list += `**${result[item].item_name}** :  ${result[item].item_price} gp   (${result[item].item_quantity})\n`;
            }
        }

        //if there were no items, say that
        if (list.length === 0) {
            list = "No items";
        }
		list += '\n**Message a DM to buy an Item**\n*Buying an enchantment such as +1 Weapon requires you own the item to be enchanted. ex: to get +1 Plate Armor you must buy Plate armor **and** the +1 Armor enchantment.';

        //adds list to embed and prints
        shop_inventory.addField("**Item Name**:   [price] gp   (quantity)", list);
		
        message.channel.send(shop_inventory);
        console.log("Shop inventory printed");
    });
    
}

//DM command to buy an item from shop
var buy_item = function (args, message) {

    if (!args[1]) {
        console.log("No arguemnts for ~buyitem");
        return message.channel.send("The syntax for 'buyitem' is '~buyitem [character name], [item bought]', or '~buyitem [character name], [item bought], [quantity bought]'.");
    }

    var text = args.splice(1).join(" ");

    var regEx = /\s*(.*?)(?:,|$)/g;
    var match;

    var matches = [];

    //grabs all players to be given shards
    while ((match = regEx.exec(text)[1]) != '') {
        matches.push(match);
    }

    ///////////////
    if (!matches || matches.length < 2 || matches.length > 3) {
        console.log("Invalid arguments for ~buyitem");
        return message.channel.send("Invalid syntax for ~buy item. make sure there is an item and a character");
    }

    var char_name = matches[0];
    var item_to_buy = matches[1];
    var quantity_to_buy = matches.length === 3 ? matches[2] : 1;

    if (!parseInt(quantity_to_buy) || quantity_to_buy < 1) {
        console.log(`Cannot buy a non-integer or negative quantity of an item`);
        return message.channel.send("Invalid Syntax. Please give a positivy integer for quantity.");
    }

    console.log(`Attempting to buy ${quantity_to_buy} of ${item_to_buy}.`);

    //looks for item in shop inventory
    var sql = `SELECT * FROM shop_inventory WHERE item_name = "${item_to_buy}";`;
    con.query(sql, function (err, result) {
        if (err) {
            console.log("SQL error (result) : " + err);
            message.channel.send("SQL error, try again in a few minutes");
            return;
        }

        if (!result || result.length == 0) {
            console.log("Item not found");
            return message.channel.send("Item not found");
        }

        if (result[0].item_quantity < quantity_to_buy) {
            console.log("Not enough of the item in stock");
            return message.channel.send(`${item_to_buy} does not have ${quantity_to_buy} in stock. Check again soon.`);
        }

        //if item is there, remove it from the inventory
        var remove_item_sql = `UPDATE shop_inventory SET item_quantity = item_quantity - ${quantity_to_buy} WHERE item_name = "${item_to_buy}";`;        

        con.query(remove_item_sql, function (err, delete_result) {
            if (err) {
                console.log("SQL error (delete_result) : " + err);
                message.channel.send("SQL error, try again in a few minutes");
                return;
            }

            console.log("Item found, removed from shop inventory");
            //message that the item was bought for expected price
            return bot_commands.send(`**${quantity_to_buy} ${item_to_buy}** ${quantity_to_buy > 1 ? 'were' : 'was'} bought by **${char_name}** for **${result[0].item_price * quantity_to_buy} gp**`);

        });

    });

}

//Shows a list of approved homebrews and uploads the JSON file
var show_homebrew = function (args, message) {

    console.log("Showing homebrew");

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
    console.log("homebrew listed");
}

//rolls a character stat array with guild rules
var roll_char = function (args, message) {

    console.log(`${message.author.username} is rolling a character stat array.`);

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
    console.log("Stats rolled.");
}


var list_guild = function (args, message) {

    console.log("Listing guild roster.");

    var sql = `SELECT * FROM roster WHERE 1`;

    con.query(sql, function (err, result) {
        if (err) {
            console.log("SQL error (result) : " + err);
            message.channel.send("SQL error, try again in a few minutes");
            return;
        }

        var output = "**__GUILD ROSTER__**\n__**Character**, level__\n";

        for (var i = 0; i < result.length; i++) {
            output += `**${result[i].charName}**, ${result[i].level}\n`;
        }
        message.channel.send(output);
        console.log("Guild roster printed");

    });

}

var edit_quest = function (args, message) {

    if (!args[1]) {
        console.log("No arguments provided for edit_quest.");
        message.channel.send("The syntax for 'check' is '~editquest [quest name], [property to add/change], [new value]'.");
        return;
    }

    //Format ~complete  [quest name], [field to edit/add], [new value]
    text = args.splice(1).join(" ");

    var regEx = /\s*(.*?),\s*(.*?),\s*(.*?)$/;
    var match = regEx.exec(text);

    if (!match || match.length < 3) {
        console.log("Invalid arguments for ~complete");
        message.channel.send("Invalid syntax. The syntax for 'complete' is '~complete [quest title], [xp awarded]'.");
        return;
    }

    var quest = match[1];
    var editField = match[2];
    var newValue = match[3];

    console.log(`editing quest, ${quest}, making field ${editField} have value of ${newValue}.`);

    con.query(`SELECT * FROM quest_data WHERE quest_name="${quest}";`, function (err, result) {
        if (err) {
            message.channel.send("Something went wrong. Try again in a couple of minutes.");
        }

        if (result[0] == undefined) {
            message.channel.send("No such quest with that title");
            console.log(`${quest} wasn't found.`);
            return;
        }

        if (message.author.id !== result[0].quest_DM && message.author.id !== chris_id) {
            message.channel.send("You can't edit someone else's quest!");
            console.log(`Quest owned by another DM`);
            return;
        }

        quest_board.fetchMessage(result[0].message_id)
            .then(msg => {
                let newEmbed = new Discord.RichEmbed(msg.embeds[0]);

                var editErrors = false;

                try {
                    var matchFound = false;
                    if (editField == 'title' || editField == newEmbed.title) {
                        if (newValue == '-remove') { editErrors = true; }
                        newEmbed.setTitle(newValue);
                        matchFound = true;
                    } else {
                        for (var field in newEmbed.fields) {
                            if (newEmbed.fields[field].name == editField) {
                                if (newValue == '-remove') {
                                    newEmbed.fields.splice(field, 1);
                                } else {
                                    newEmbed.fields[field].value = newValue;
                                }
                                matchFound = true;
                                break;
                            }
                        }
                    }

                    if (!matchFound) {
                        console.log("none found");
                        if (!newValue != '-remove') {
                            newEmbed.addField(editField, newValue);
                        } else {
                            message.channel.send(`Could not remove field ${editField}`);
                            return;
                        }
                    }
                } catch (e) {
                    console.log(e);
                    message.channel.send("Error editing quest, check console for details; likely a field exceeded 1024 characters.");
                    return;
                }

                
                var newlvl;
                var newsize;
                //console.log(newEmbed.fields);
                for (var field in newEmbed.fields) {
                    if (newEmbed.fields[field].name.toLowerCase() == "party level" || newEmbed.fields[field].name.toLowerCase() == "recommended level" || newEmbed.fields[field].name.toLowerCase() == "level") {
                        newlvl = parseInt(newEmbed.fields[field].value);
                    }
                    if (newEmbed.fields[field].name.toLowerCase() == "party size" || newEmbed.fields[field].name.toLowerCase() == "size") {
                        var numbers = newEmbed.fields[field].value.match(/\d+/g).map(Number);
                        newsize = numbers[numbers.length - 1];
                    }
                }

                if (!newlvl || !newsize) {
                    editErrors = true;
                }

                if (editErrors) {
                    message.channel.send("Could not process changes. Please check your syntax and make sure you did not remove an important element.");
                    console.log('edit errors');
                    return;
                }

                var sql = `UPDATE quest_data SET quest_name='${newEmbed.title}', quest_lvl=${newlvl}, size=${newsize} WHERE message_id = ${msg.id}`;

                con.query(sql, (err, result2) => {
                    if (err) throw err;

                    //msg.edit(msg.content, { embed: newEmbed });
                    var new_text;

                    if (result[0].total_players >= newsize) {
                        new_text = '**QUEST STATUS: CLOSED**';
                    } else {
                        new_text = `**QUEST STATUS: OPEN ${result[0].total_players}/${newsize}**`;
                    }

                    var chris = server.members.get(chris_id);

                    msg.edit(new_text, { embed: newEmbed });

                });

        });

    });
}

var repost_quest = function (args, message) {

    if (!args[1]) {
        console.log("No arguments provided for repost_quest.");
        message.channel.send("The syntax for 'check' is '~repostquest [quest name]'.");
        return;
    }

    var quest = args.splice(1).join(" ");
    console.log(`reposting quest, ${quest}`);

    con.query(`SELECT * FROM quest_data WHERE quest_name="${quest}";`, function (err, result) {
        if (err) {
            message.channel.send("Something went wrong. Try again in a couple of minutes.");
        }

        if (result[0] == undefined) {
            message.channel.send("No such quest with that title");
            console.log(`${quest} wasn't found.`);
            return;
        }

        if (message.author.id !== result[0].quest_DM && message.author.id !== chris_id) {
            message.channel.send("You can't repost someone else's quest!");
            console.log(`Quest owned by another DM`);
            return;
        }

        var chris = server.members.get(chris_id);

        quest_board.fetchMessage(result[0].message_id)
            .then(msg => {
                quest_board.send(msg.content, { embed: new Discord.RichEmbed(msg.embeds[0]) }).then(newPost => {
                    var sql = `UPDATE quest_data SET message_id='${newPost.id}' WHERE message_id = ${msg.id}`;

                    con.query(sql, (err, result2) => {
                        if (err) throw err;

                        msg.delete();
                        console.log("quest reposted.");
                    });
                });

        });

    });
}

var rand_shop_item = function (args, message) {

    //checks to make sure there are enough arguments
    if (!args[1]) {
        console.log("No arguments for ~randitem");
        return message.channel.send("The syntax for 'randitem' is '~randitem [loot table tier]'.");
    }

    //input form:
    //~loot [player name], [quantity of shards] 
    //doesn't care about line breaks. you can use them or not use them and the regex will be fine

    console.log("Rolling random item for the shop inventory.");

    var tier = parseInt(args[1]);

    if (!tier) {
        console.log("Tier was not parsed.");
        message.channel.send("Invalid syntax, Tier not parsed. The syntax for 'randitem' is '~randitem [loot table tier]'.");
        return;
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

            message.author.send(`Random Item on the ${tier} tier table was: ${rolled_item}`);
            console.log("Item generated");
            return;
        }
    }

}
