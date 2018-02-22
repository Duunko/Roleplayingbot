function Player(user, name) {

    if (!(this instanceof Player)) {
        return new Player(user, name);
    }

    this.user = user;

    this.race = 'race';

    this.class = 'class';

    this.name = name;

    this.race;

    this.hp = '1';

    this.inv = {
        gold: '1'
    };

    this.stats = {
        str: 0,
        con: 0,
        dex: 0,
        int: 0,
        cha: 0,
        wis: 0
    };

    this.avatar = 'none';

    this.notes = {
        example: 'this is an example note'
    };
};



Player.prototype.setName = function setName(newName) {
    this.name = newName;
};

Player.prototype.setStat = function setStat(newStat, stat) {
    this.stats[stat] = parseInt(newStat);
};

Player.prototype.set = function set(setting, setTo) {
    this[setting] = setTo;
};


module.exports = Player;