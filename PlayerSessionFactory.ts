import I = require('./Interfaces');
import PlayerRunner = require('./PlayerRunner');

class PlayerSessionFactory {
	public generateSession(): I.PlayerSession {
		return {
			status: PlayerRunner.INITIALIZED,
			sessionToken: "",
		};
	}
}

export = PlayerSessionFactory;