import nconf = require('nconf');
import I = require('../Interfaces');

class Settings implements I.Settings {
    get httpPort(): number {
        return nconf.get('httpPort');
	}
	get loadTestUris(): Array<string> {
		return nconf.get('loadTestUris');
	}
	get timeoutForRequestPost(): number {
		return nconf.get('timeoutForRequestPost');
	}
	get lobbiesLoadBalancedUri(): string {
		return nconf.get('lobbiesLoadBalancedUri');
	}
	get lobbiesSocketHost(): string {
		return nconf.get('lobbiesSocketHost');
	}
	get playerAccountsUri(): string {
		return nconf.get('playerAccountsUri');
	}
	get playerStatsUri(): string {
		return nconf.get('playerStatsUri');
	}
	get chatServersSocketPort(): number {
		return nconf.get('chatServersSocketPort');
	}
	get chatServersSocketHost(): string {
		return nconf.get('chatServersSocketHost');
	}
	get motdToAccountCreationMs(): number {
		return nconf.get('motdToAccountCreationMs');
	}
	get loopEndToLoopStartMs(): number {
		return nconf.get('loopEndToLoopStartMs');
	}
	get joinAllChatToSendMessageMs(): number {
		return nconf.get('joinAllChatToSendMessageMs');
	}
	get switchChatroomToSendMessageMs(): number {
		return nconf.get('switchChatroomToSendMessageMs');
	}
	get sendMessageToGetUsersMs(): number {
		return nconf.get('sendMessageToGetUsersMs');
	}
	get getUsersToListGamesMs(): number {
		return nconf.get('getUsersToListGamesMs');
	}
	get listGamesToHostGameMs(): number {
		return nconf.get('listGamesToHostGameMs');
	}
	get sendMessageToChangeMapMs(): number {
		return nconf.get('sendMessageToChangeMapMs');
	}
	get changeMapToLockTeamsMs(): number {
		return nconf.get('changeMapToLockTeamsMs');
	}
	get lockTeamsToChooseCommanderMs(): number {
		return nconf.get('lockTeamsToChooseCommanderMs');
	}
	get chooseCommanderToSwitchCommanderMs(): number {
		return nconf.get('chooseCommanderToSwitchCommanderMs');
	}
	get chooseCommanderToLockCommanderMs(): number {
		return nconf.get('chooseCommanderToLockCommanderMs');
	}
	get lockCommanderToWaitForGameMs(): number {
		return nconf.get('lockCommanderToWaitForGameMs');
	}
	get inGameToConnectToMockUdkServerMs(): number {
		return nconf.get('inGameToConnectToMockUdkServerMs');
	}
	get gameEndToGetEndGameStats(): number {
		return nconf.get('gameEndToGetEndGameStats');
	}
	get playersArriveToCommanderSelect(): number {
		return nconf.get('playersArriveToCommanderSelect');
	}
	get graylog2(): I.Graylog2 {
		return nconf.get('graylog2');
    }
    get requestMaxSockets(): number {
        return nconf.get('requestMaxSockets');
    }
    get requestKeepAlive(): boolean {
        return nconf.get('requestKeepAlive');
    }
}

let defaultSettings: I.Settings = {
	httpPort: 10900,
	loadTestUris: ["http://127.0.0.1"],
	timeoutForRequestPost: 10000,
	lobbiesLoadBalancedUri: "http://127.0.0.1:10000/v1",
	playerAccountsUri: "https://127.0.0.1",
	playerStatsUri: "http://127.0.0.1:10500",
	chatServersSocketPort: 10700,
	chatServersSocketHost: "127.0.0.1",
	motdToAccountCreationMs: 1000,
	loopEndToLoopStartMs: 5000,
	joinAllChatToSendMessageMs: 1000,
	sendMessageToGetUsersMs: 1000,
	getUsersToListGamesMs: 2000,
	listGamesToHostGameMs: 2000,
	switchChatroomToSendMessageMs: 2000,
	sendMessageToChangeMapMs: 2000,
	changeMapToLockTeamsMs: 2000,
	playersArriveToCommanderSelect: 10000,
	lockTeamsToChooseCommanderMs: 2000,
	chooseCommanderToSwitchCommanderMs: 2000,
	chooseCommanderToLockCommanderMs: 2000,
	lockCommanderToWaitForGameMs: 2000,
	inGameToConnectToMockUdkServerMs: 2000,
	gameEndToGetEndGameStats: 15000,
	graylog2: {
		name: "Graylog",
		level: "debug",
		graylog: {
			servers: [{
				host: "analytics.beta.maestrosgame.com",
				port: 12201
			}],
			facility: "LoadTest",
        },
        staticMeta: { shard: 'local' }
    },
    requestMaxSockets: 1000,
    requestKeepAlive: true
};

nconf.file('./config/settings.json')
    .defaults(defaultSettings);

let settings: I.Settings = new Settings();
export = settings;