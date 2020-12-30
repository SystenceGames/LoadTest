import Q = require('q');
import assert = require('assert');
import request = require('request');

import I = require('./Interfaces');
let logger = require('./logger');
let settings: I.Settings = require('./config/settings');
import net = require('net');
import https = require('https');
import http = require('http');

import PlayerSessionFactory = require('./PlayerSessionFactory');
import SplitStreamOnNewJSON = require('./SplitStreamOnNewJSON');

class PlayerRunner {
	public static readonly INITIALIZED: string = "initialized";
	public static readonly MOTD: string = "motd";
	public static readonly CREATING_ACCOUNT: string = "creatingAccount";
	public static readonly LOGGING_IN: string = "loggingIn";
	public static readonly DELETING: string = "deleting";
	public static readonly GETTING_INITIAL_PLAYER_STATS: string = "gettingInitialPlayerStats";
	public static readonly GETTING_INITIAL_PLAYER_INVENTORY: string = "gettingInitialPlayerInventory";
	public static readonly JOINING_ALL_CHAT: string = "joiningAllChat";
	public static readonly SENDING_INITIAL_MESSAGE: string = "sendingInitialMessage";
	public static readonly GETTING_USERS_IN_CHAT: string = "gettingUsersInChat";
	public static readonly LISTING_GAMES: string = "listingGames";
	public static readonly JOINING_GAME: string = "joiningGame";
	public static readonly HOSTING_GAME: string = "hostingGame";
	public static readonly MAKING_LOBBIES_SOCKET: string = "makingLobbiesSocket";
	public static readonly GETTING_LOBBY_PLAYERS_STATS: string = "gettingLobbyPlayersStats";
	public static readonly SWITCHING_TO_GAME_CHAT_ROOM: string = "switchingToGameChatRoom";
	public static readonly SENDING_GAME_ROOM_MESSAGE: string = "sendingGameRoomMessage";
	public static readonly CHANGING_MAP: string = "changingMap";
	public static readonly LOCKING_TEAMS: string = "lockingTeams";
	public static readonly GETTING_LOBBY_PLAYER_INVENTORY: string = "gettingLobbyPlayerInventory";
	public static readonly CHOOSING_COMMANDER: string = "choosingCommander";
	public static readonly LOCKING_COMMANDER: string = "lockingCommander";
	public static readonly WAITING_FOR_GAME_STARTED: string = "waitingForGameStarted";
	public static readonly IN_GAME: string = "inGame";
	public static readonly GETTING_ENDGAME_STATS: string = "gettingEndgameStats";
	public static readonly WAITING_FOR_PLAYERS: string = "waitingForPlayers";
	public static readonly WAITING_FOR_COMMANDER_SELECT: string = "waitingForCommanderSelect";
	public static readonly LEAVING_GAME_LOBBY: string = "leavingGameLobby";

	public static readonly SEND_MESSAGE_COMMAND_TYPE: string = "SendMessage";
	public static readonly GET_USERS_COMMAND_TYPE: string = "GetUsers";
	public static readonly SWITCH_ROOM_COMMAND_TYPE: string = "SwitchRoom";

	public static readonly ALL_CHAT_ROOM_NAME = "allChat"
	public static readonly SEND_MESSAGE_CONTENT: string = "I was here.";

	public static readonly MAP_NAME = "SacredArena"
	public static readonly GAME_TYPE = "TheMaestrosGame.TMRoundBasedGameInfo"

	public static readonly LOBBY_INFO_STATE_IN_GAME: string = "InGame";
	public static readonly UPDATE_GAME_INFO_COMMAND: string = "updateGameInfo";

	public static readonly SPECTATOR_TEAM_NUMBER: number = 3;

	private readonly agentOptions: https.AgentOptions = {
		maxSockets: 1000,
		keepAlive: true
	};
	private httpsAgent = new https.Agent(this.agentOptions);
	private httpAgent = new http.Agent(this.agentOptions);

	public readonly playerSessionFactory: PlayerSessionFactory;

	constructor(playerSessionFactory: PlayerSessionFactory) {
		this.playerSessionFactory = playerSessionFactory;
	}

	public start(player: I.Player): void {
		// do things
		Q.fcall(() => {
			logger.info("Starting", { playerName: player.playerName, status: player.session.status });
		}).then(() => {
			this.loop(player);
		});
	}

	private exitable(player: I.Player, method: any): any {
		return Q.fcall(() => {
			if (player.shouldExit) {
				let playerExitError: any = new Error("PlayerExitError");
				playerExitError.isPlayerExitError = true;
				throw playerExitError;
			}
		}).then(() => {
			return method();
		});
	}

	public hostLoop(player: I.Player) {
		delete player.loopTimer;
		this.createOrLogin(player).then(() => {
			return this.sendAllChatMessage(player)
		}).then(() => {
			return this.createGame(player);
		}).then(() => {
			return this.waitForPlayers(player); // 6 Players
		}).then(() => {
			return this.startCommanderSelect(player);
		}).then(() => {
			return this.selectCommanderAndPlayGame(player);
		}).then(() => {
			return this.getEndGameStats(player);
		}).then(() => {
			return this.rescheduleLoop(player);
		}).catch((error: any) => {
			this.caughtLoopError(player, error);
		});
	}

	public followerLoop(player: I.Player) {
		delete player.loopTimer;
		this.createOrLogin(player).then(() => {
			return this.sendAllChatMessage(player)
		}).then(() => {
			return this.joinValidGame(player); // <--- loop here
		}).then(() => {
			return this.waitForCommanderSelect(player); // 6 Players
		}).then(() => {
			return this.selectCommanderAndPlayGame(player);
		}).then(() => {
			return this.getEndGameStats(player);
		}).then(() => {
			return this.rescheduleLoop(player);
		}).catch((error: any) => {
			this.caughtLoopError(player, error);
		});
	}

	public loop(player: I.Player) {
		if (player.isHost) {
			this.hostLoop(player);
		} else {
			this.followerLoop(player);
		}
		//this.singleLoop(player);
	}

	public singleLoop(player: I.Player) {
		delete player.loopTimer;
		this.createOrLogin(player).then(() => {
			return this.sendAllChatMessage(player);
		}).then(() => {
			return this.createGame(player);
		}).then(() => {
			return this.startCommanderSelect(player);
		}).then(() => {
			return this.selectCommanderAndPlayGame(player);
		}).then(() => {
			return this.getEndGameStats(player);
		}).then(() => {
			return this.rescheduleLoop(player);
		}).catch((error: any) => {
			this.caughtLoopError(player, error);
		});
	}

	public createOrLogin(player: I.Player): Q.Promise<any> {
		return Q.fcall(() => {
			return this.exitable(player, () => {
				player.loopsStarted++;
				this.changeStatus(player, PlayerRunner.MOTD);
				return this.getMOTD(player);
			});
		}).then(() => {
			return this.exitable(player, () => {
				let promise: Q.Promise<any>;
				if (player.accountCreated) {
					this.changeStatus(player, PlayerRunner.LOGGING_IN);
					promise = this.login(player).then((playerAccountsResponse: I.PlayerAccountsResponse) => {
						player.session.sessionToken = playerAccountsResponse.sessionToken;
						logger.info("LoggedIn", { playerName: player.playerName, status: player.session.status });
					});
				} else {
					this.changeStatus(player, PlayerRunner.CREATING_ACCOUNT);
					promise = this.createPlayer(player).then((playerAccountsResponse: I.PlayerAccountsResponse) => {
						player.session.sessionToken = playerAccountsResponse.sessionToken;
						player.accountCreated = true;
						logger.info("AccountCreated", { playerName: player.playerName, status: player.session.status });
						return this.verifyEmail(player);
					});
				}
				return promise;
			});
		}).then(() => {
			return this.exitable(player, () => {
				this.changeStatus(player, PlayerRunner.MOTD);
				return this.getMOTD(player);
			});
		}).then(() => {
			return this.exitable(player, () => {
				this.changeStatus(player, PlayerRunner.GETTING_INITIAL_PLAYER_STATS);
				return this.getPlayerStats(player);
			});
		}).then(() => {
			return this.exitable(player, () => {
				this.changeStatus(player, PlayerRunner.GETTING_INITIAL_PLAYER_INVENTORY);
				return this.getPlayerInventory(player);
			});
		});
	}

	public sendAllChatMessage(player: I.Player): Q.Promise<any> {
		return Q.fcall(() => {
			return this.exitable(player, () => {
				this.changeStatus(player, PlayerRunner.JOINING_ALL_CHAT);
				return this.makeChatServerSocket(player, PlayerRunner.ALL_CHAT_ROOM_NAME);
			});
		}).delay(settings.joinAllChatToSendMessageMs).then(() => {
			return this.exitable(player, () => {
				this.changeStatus(player, PlayerRunner.SENDING_INITIAL_MESSAGE);
				return this.sendChatServerMessage(player);
			});
		}).delay(settings.sendMessageToGetUsersMs).then(() => {
			return this.exitable(player, () => {
				this.changeStatus(player, PlayerRunner.GETTING_USERS_IN_CHAT);
				return this.getUsersInChat(player, PlayerRunner.ALL_CHAT_ROOM_NAME);
			});
		});
	}

	public createGame(player: I.Player): Q.Promise<any> {
		return Q.delay(settings.getUsersToListGamesMs).then(() => {
			return this.exitable(player, () => {
				this.changeStatus(player, PlayerRunner.LISTING_GAMES);
				return this.listGames(player);
			});
		}).delay(settings.listGamesToHostGameMs).then(() => {
			return this.exitable(player, () => {
				this.changeStatus(player, PlayerRunner.HOSTING_GAME);
				return this.hostGame(player);
			});
		}).then((game: I.Game) => {
			player.session.game = game;
			logger.info("HostedLobby", { playerName: player.playerName, status: player.session.status });
			return this.exitable(player, () => {
				this.changeStatus(player, PlayerRunner.MAKING_LOBBIES_SOCKET);
				return this.makeLobbiesSocket(player);
			});
		}).then(() => {
			return this.postJoinGame(player);
		}).delay(settings.sendMessageToChangeMapMs).then(() => {
			return this.exitable(player, () => {
				this.changeStatus(player, PlayerRunner.CHANGING_MAP);
				return this.updateLobbyInfo(player, "changeMap", "Crater");
			});
		}).delay(settings.changeMapToLockTeamsMs);
	}

	private postJoinGame(player: I.Player): Q.Promise<any> {
		return Q.fcall(() => { }).then(() => {
			logger.info("JoinedLobby", { playerName: player.playerName, status: player.session.status });
			return this.exitable(player, () => {
				this.changeStatus(player, PlayerRunner.MOTD);
				return this.getMOTD(player);
			});
		}).then(() => {
			return this.exitable(player, () => {
				this.changeStatus(player, PlayerRunner.GETTING_LOBBY_PLAYERS_STATS);
				return this.getPlayerStats(player);
			});
		}).then(() => {
			return this.exitable(player, () => {
				this.changeStatus(player, PlayerRunner.SWITCHING_TO_GAME_CHAT_ROOM);
				return this.switchToChatRoom(player, player.session.game.gameGUID);
			});
		}).delay(settings.switchChatroomToSendMessageMs).then(() => {
			return this.exitable(player, () => {
				this.changeStatus(player, PlayerRunner.SENDING_GAME_ROOM_MESSAGE);
				return this.sendChatServerMessage(player);
			});
		});
	}

	private gotValidGameInList(player: I.Player): boolean {
		if (player.session.game != null) {
			return true;
		}
		return false;
	}

	private joinValidGameIfAvailable(player: I.Player): Q.Promise<I.Player> {
		return this.exitable(player, () => {
			return Q.delay(settings.getUsersToListGamesMs).then(() => {
				return this.listGames(player);
			}).then((lobbyListings: Array<I.LobbyListing>): Q.Promise<I.Player> => {
				let validLobbyListing: I.LobbyListing = lobbyListings.find(lobbyListing => lobbyListing.numOfPlayers < 6);
				if (validLobbyListing == null) {
					return Q.fcall(() => {
						return player;
					});
				} else {
					let game: I.Game = {
						connectionKey: null,
						gameGUID: validLobbyListing.gameGUID,
						gameName: validLobbyListing.gameName,
						httpEndpoint: validLobbyListing.httpEndpoint,
						host: validLobbyListing.host,
						port: validLobbyListing.port
					};
					player.session.game = game;
					return this.proceedToJoinGame(player);
				}
			});
		});
	}

	private proceedToJoinGame(player: I.Player): Q.Promise <any> {
		return this.joinGame(player).then((joinGameResponse: I.JoinGameResponse) => {
			if (!joinGameResponse.connectionKey) {
				return Q.fcall(() => {
					player.session.game = null;
					return player;
				});
			} else {
				player.session.game.connectionKey = joinGameResponse.connectionKey
				return this.proceedToMakeLobbiesSocket(player);
			}
		});
	}

	private proceedToMakeLobbiesSocket(player: I.Player): Q.Promise<any> {
		return this.makeLobbiesSocket(player).then((successful: boolean) => {
			if (!successful) {
				return this.leaveGameLobby(player).then(() => {
					return player;
				});
			} else {
				return this.proceedToPostJoinGame(player);
			}
		});
	}

	private proceedToPostJoinGame(player: I.Player): Q.Promise<any> {
		return this.postJoinGame(player).then(() => {
			return this.retrieveIsSpectator(player);
		}).then((shouldntProceed: boolean) => {
			if (shouldntProceed) {
				return this.leaveGameLobby(player).then(() => {
					return player;
				});
			} else {
				return player;
			}
		});
	}

	private leaveGameLobby(player: I.Player): Q.Promise<any> {
		return this.exitable(player, () => {
			return Q.fcall(() => {
				this.changeStatus(player, PlayerRunner.LEAVING_GAME_LOBBY);
				return this.switchToChatRoom(player, "allChat");
			}).then(() => {
				player.session.lobbiesSocket.end();
				player.session.lobbiesSplitter.removeAllListeners();
				player.session.game = null;
			});
		});
	}

	public joinValidGame(player: I.Player): Q.Promise<any> {
		return Q.delay(settings.getUsersToListGamesMs).then(() => {
			return this.promiseWhile<I.Player>(
				player,
				(inPlayer1: I.Player): boolean => {
					return this.gotValidGameInList(inPlayer1);
				},
				(inPlayer2: I.Player): Q.Promise<I.Player> => {
					return this.joinValidGameIfAvailable(inPlayer2);
				});
		});
	}

	public promiseWhile<T>(initialArg: T, shouldExitLoop: (arg: T) => boolean, body: (arg: T) => Q.Promise<T>): Q.Promise<T> {
		let done: Q.Deferred<T> = Q.defer<T>();
		function loop(inArg: T) {

			if (shouldExitLoop(inArg)) {
				return done.resolve(inArg);
			}
			// Use `when`, in case `body` does not return a promise.
			// When it completes loop again otherwise, if it fails, reject the
			// done promise
			Q.nextTick(() => {
				return Q.when(body(inArg), (arg2: T) => { loop(arg2) }, done.reject)
			});
		}

		// Start running the loop in the next tick so that this function is
		// completely async. It would be unexpected if `body` was called
		// synchronously the first time.
		Q.nextTick(() => { loop(initialArg) });

		return done.promise;
	}

	public waitForPlayers(player: I.Player): Q.Promise<any> {
		return this.exitable(player, () => {
			this.changeStatus(player, PlayerRunner.WAITING_FOR_PLAYERS);
			return this.waitForPlayersHelper(player);
		});
	}

	public waitForPlayersHelper(player: I.Player): Q.Promise<any> {
		let deferred: Q.Deferred<any> = Q.defer();

		let onData: Function = function handleSocketData(chunk: any) {
			try {
				let obj: any = JSON.parse(chunk);

				logger.info("Response-Lobbies-onData-updateGameInfo", { playerName: player.playerName, status: player.session.status, obj: JSON.stringify(obj) });
				if (obj.command == PlayerRunner.UPDATE_GAME_INFO_COMMAND && obj.body != null && obj.body.players != null && PlayerRunner.isLobbyFull(obj.body.players)) {
					logger.info("Response-Lobbies-onData-updateGameInfo", { playerName: player.playerName, status: player.session.status, obj: JSON.stringify(obj) });

					player.session.lobbiesSplitter.removeListener('data', handleSocketData);

					deferred.resolve();
				}
			} catch (err) {
				logger.info("Response-Lobbies-onData-updateGameInfo-error", { playerName: player.playerName, status: player.session.status, err: err });
			}
		};

		player.session.lobbiesSplitter.on('data', onData);
		player.session.lobbiesSocket.on('error', (error) => {
			deferred.reject(error);
		});

		return deferred.promise;
	}

	public static isLobbyFull(players: Array<I.UpdateGameInfoResponsePlayer>): boolean {
		if (players.length != 6) {
			return false;
		}
		var numSpectators: number = players.filter(player => player.teamNumber == PlayerRunner.SPECTATOR_TEAM_NUMBER).length;

		return numSpectators == 0;
	}

	public waitForCommanderSelect(player: I.Player): Q.Promise<any> {
		return this.exitable(player, () => {
			this.changeStatus(player, PlayerRunner.WAITING_FOR_COMMANDER_SELECT);
			return this.waitForCommanderSelectHelper(player);
		});
	}

	public waitForCommanderSelectHelper(player: I.Player): Q.Promise<any> {
		let deferred: Q.Deferred<any> = Q.defer();

		let onData: Function = function handleSocketData(chunk: any) {
			try {
				let obj: any = JSON.parse(chunk);
				logger.info("Response-Lobbies-onData-updateGameInfo", { playerName: player.playerName, status: player.session.status, obj: JSON.stringify(obj) });

				if (obj.command == PlayerRunner.UPDATE_GAME_INFO_COMMAND && obj.body.status == "CommanderSelect") {
					logger.info("Response-Lobbies-onData-updateGameInfo", { playerName: player.playerName, status: player.session.status, obj: JSON.stringify(obj) });

					player.session.lobbiesSplitter.removeListener('data', handleSocketData);

					deferred.resolve();
				}
			} catch (err) {
				logger.info("Response-Lobbies-onData-updateGameInfo-error", { playerName: player.playerName, status: player.session.status, err: err });
			}
		};

		player.session.lobbiesSplitter.on('data', onData);
		player.session.lobbiesSocket.on('error', (error) => {
			deferred.reject(error);
		});

		return deferred.promise;
	}

	public retrieveIsSpectator(player: I.Player): Q.Promise<any> {
		let deferred: Q.Deferred<any> = Q.defer();

		let onData: Function = function handleSocketData(chunk: any) {
			try {
				let obj: any = JSON.parse(chunk);

				if (obj.command == PlayerRunner.UPDATE_GAME_INFO_COMMAND && obj.body != null && obj.body.players != null) {
					logger.info("Response-Lobbies-onData-updateGameInfo", { playerName: player.playerName, status: player.session.status, obj: JSON.stringify(obj) });

					player.session.lobbiesSplitter.removeListener('data', handleSocketData);
					let players: Array<any> = obj.body.players;
					for (let i = 0; i < players.length; i++) {
						if (players[i].playerName == player.playerName) {
							let isSpectator: boolean = players[i].teamNumber == PlayerRunner.SPECTATOR_TEAM_NUMBER;
							deferred.resolve(isSpectator);
						}
					}
				}
			} catch (err) {
				logger.info("Response-Lobbies-onData-updateGameInfo-error", { playerName: player.playerName, status: player.session.status, err: err });
			}
		};

		player.session.lobbiesSplitter.on('data', onData);
		player.session.lobbiesSocket.on('error', (error) => {
			deferred.reject(error);
		});

		return deferred.promise;
	}

	public startCommanderSelect(player: I.Player): Q.Promise<any> {
		return Q.fcall(() => {
		}).delay(settings.playersArriveToCommanderSelect).then(() => {
			return this.exitable(player, () => {
				this.changeStatus(player, PlayerRunner.LOCKING_TEAMS);
				return this.updateLobbyInfo(player, "lockTeams", null);
			});
		});
	}

	public selectCommanderAndPlayGame(player: I.Player): Q.Promise<any> {
		return Q.fcall(() => {
			return this.exitable(player, () => {
				this.changeStatus(player, PlayerRunner.MOTD);
				return this.getMOTD(player);
			});
		}).then(() => {
			return this.exitable(player, () => {
				this.changeStatus(player, PlayerRunner.GETTING_LOBBY_PLAYER_INVENTORY);
				return this.getPlayerInventory(player);
			});
		}).delay(settings.lockTeamsToChooseCommanderMs).then(() => {
			return this.exitable(player, () => {
				this.changeStatus(player, PlayerRunner.CHOOSING_COMMANDER);
				return this.chooseCommander(player, "HiveLord");
			});
		}).delay(settings.chooseCommanderToSwitchCommanderMs).then(() => {
			return this.exitable(player, () => {
				this.changeStatus(player, PlayerRunner.CHOOSING_COMMANDER);
				return this.chooseCommander(player, "RoboMeister");
			});
		}).delay(settings.chooseCommanderToLockCommanderMs).then(() => {
			return this.exitable(player, () => {
				this.changeStatus(player, PlayerRunner.LOCKING_COMMANDER);
				return this.lockCommander(player);
			});
		}).delay(settings.lockCommanderToWaitForGameMs).then((deferred: Q.Deferred<any>) => {
			logger.info("LockedCommander", { playerName: player.playerName, status: player.session.status });
			return this.exitable(player, () => {
				this.changeStatus(player, PlayerRunner.WAITING_FOR_GAME_STARTED);
				return deferred.promise;
			});
		}).delay(settings.inGameToConnectToMockUdkServerMs).then((connectionInfo: I.ConnectionInfo) => {
			return this.exitable(player, () => {
				this.changeStatus(player, PlayerRunner.IN_GAME);
				return this.connectToMockGameServer(player, connectionInfo);
			});
		}).then((connectPlayerResponse: I.ConnectPlayerResponse) => {
			logger.info("ConnectedToGame", { playerName: player.playerName, status: player.session.status });
			return this.exitable(player, () => {
				assert.ok(connectPlayerResponse.gameDurationMs != null && typeof connectPlayerResponse.gameDurationMs === 'number', 'gameDuration not returned from mockUdkServer');
				logger.info("Player for game to end", { playerName: player.playerName, status: player.session.status, gameDuration: connectPlayerResponse.gameDurationMs + settings.gameEndToGetEndGameStats });
				return Q.delay(connectPlayerResponse.gameDurationMs + settings.gameEndToGetEndGameStats);
			});
		});
	}

	public getEndGameStats(player: I.Player): Q.Promise<any> {
		return Q.fcall(() => {
			return this.exitable(player, () => {
				this.changeStatus(player, PlayerRunner.GETTING_ENDGAME_STATS);
				return this.getEndGamePlayerStats(player, [player.playerName]);
			});
		})
	}

	public rescheduleLoop(player: I.Player) {
		return this.exitable(player, () => {
			player.loopsEndedSuccessfully++;
			logger.info("LoopEndedSuccessfully", { playerName: player.playerName, status: player.session.status });
			this.changeStatus(player, PlayerRunner.INITIALIZED);
			player = this.playerCleanup(player);
			player.loopTimer = setTimeout(() => {
				this.loop(player);
			}, settings.loopEndToLoopStartMs);
		});
	}

	public caughtLoopError(player: I.Player, error: any) {
		if (error.isPlayerExitError) {
			// do nothing?
			logger.info(player.playerName + " stopped from catch");
		} else {
			logger.error("PlayerLoopError", { playerName: player.playerName, status: player.session.status, error: error });
			player = this.playerCleanup(player);
			player.loopTimer = setTimeout(() => {
				this.loop(player);
			}, settings.loopEndToLoopStartMs);
		}
	}

	public stop(player: I.Player): void {
		player.shouldExit = true;
		Q.fcall(() => { }).then(() => {
			this.changeStatus(player, PlayerRunner.DELETING);
			if (player.loopTimer != null) {
				clearTimeout(player.loopTimer);
				logger.info("StoppedFromTimer", { playerName: player.playerName });
			}
			player = this.playerCleanup(player);
			return this.deletePlayer(player);
		}).then((response: I.DeletePlayerResponse) => {
			if (response.success) {
				logger.info("PlayerDeleteSuccess", { playerName: player.playerName });
			} else {
				logger.error("PlayerDeleteError-noSuccess", { playerName: player.playerName, status: player.session.status });
			}
		}).catch((error: any) => {
			logger.error("PlayerDeleteError-error", { playerName: player.playerName, status: player.session.status, error: error });
		});
	}

	private playerCleanup(player: I.Player): I.Player {
		logger.info("PlayerCleanup", { playerName: player.playerName, status: player.session.status });

		if (player.session.chatServerSocket) {
			player.session.chatServerSocket.end();
		}
		if (player.session.chatServerSplitter) {
			player.session.chatServerSplitter.removeAllListeners();
		}
		if (player.session.lobbiesSocket) {
			player.session.lobbiesSocket.end();
		}
		if (player.session.lobbiesSplitter) {
			player.session.lobbiesSplitter.removeAllListeners();
		}

		player.session = this.playerSessionFactory.generateSession();
		return player;
	}

	private static assertResponseIsValid(error: any, response: any, body: any, callingUrl: string) {
		if (error) {
			throw error;
		}
		assert.ok(response != null, "Request Post to " + callingUrl + " has an empty response");
		assert.ok(body != null, "Request Post to " + callingUrl + " has an empty body");
		if (body.error) {
			throw new Error("Request to " + callingUrl + " Post Body has error in assertResponseIsValid(): " + body.error);
		}
	}

	private static assertResponseIsValidForJoinGame(error: any, response: any, body: any, callingUrl: string) {
		if (error) {
			throw error;
		}
		assert.ok(response != null, "Request Post to " + callingUrl + " has an empty response");
		assert.ok(body != null, "Request Post to " + callingUrl + " has an empty body");
		if (body.error && body.error != "Lobby is full" && body.error != "No such game exists" && body.error != "Lobby state is not a joinable state") {
			throw new Error("Request to " + callingUrl + " Post Body has error in assertResponseIsValid(): " + body.error);
		}
	}

	private agentFor(callingUrl: string) {
		if (callingUrl.indexOf("https") == 0) {
			return this.httpsAgent;
		} else {
			return this.httpAgent;
		}
	}

	private call(callingUrl: string, player: I.Player, requestBody: any, errorHandlingStrategy?: (error: any, response: any, responseBody: any, callingUrl: string) => void): Q.Promise<any> {
		if (!errorHandlingStrategy) {
			errorHandlingStrategy = PlayerRunner.assertResponseIsValid;
		}

		let deferred: Q.Deferred<any> = Q.defer<any>();
		let agent = this.agentFor(callingUrl);

		Q.fcall(() => {
			request.post({
				uri: callingUrl,
				timeout: settings.timeoutForRequestPost,
				strictSSL: false,
				//agent: false,
				//pool: { maxSockets: settings.requestMaxSockets, keepAlive: settings.requestKeepAlive },
				json: true,
				form: requestBody,
				time: true
			}, (error: any, response: any, responseBody: any) => {
				if (response != null) {
					logger.info("OutboundCall", { url: callingUrl, durationMs: response.elapsedTime, statusCode: response.statusCode });
				}
				logger.info("ResponseBody", { playerName: player.playerName, responseBody: JSON.stringify(responseBody) });
				try {
					errorHandlingStrategy(error, response, responseBody, callingUrl);
				} catch (error) {
					deferred.reject(error);
					return;
				}
				deferred.resolve(responseBody);
			});
		});
		return deferred.promise;
	}

	private callPlayerStats(callingUrl: string, player: I.Player, body: any): Q.Promise<any> {
		let playerStatsBody: any = {
			playerStats: JSON.stringify(body)
		};
		return this.call(callingUrl, player, playerStatsBody);
	}

	private getMOTD(player: I.Player): Q.Promise<any> {
		let callingUrl: string = settings.lobbiesLoadBalancedUri + '/platformMOTD';
		return this.call(callingUrl, player, null);
	}

	private createPlayer(player: I.Player): Q.Promise<I.PlayerAccountsResponse> {
		let callingUrl: string = settings.playerAccountsUri + '/createPlayer2';
		let createPlayerRequest: I.CreatePlayerRequest = {
			birthDate: "12-04-1991",
			email: player.email,
			playerName: player.playerName,
			password: player.password
		};

		return this.call(callingUrl, player, createPlayerRequest).then((response: any) => {
			assert.ok(response.email != null && typeof response.email === 'string', "missing email from createPlayer2 response");
			assert.ok(response.playerName != null && typeof response.playerName === 'string', "missing playerName from createPlayer2 response");
			assert.ok(response.sessionToken != null && typeof response.sessionToken === 'string', "missing sessionToken from createPlayer2 response");

			return {
				email: response.email,
				playerName: response.playerName,
				sessionToken: response.sessionToken
			};
		});
	}

	private login(player: I.Player): Q.Promise<I.PlayerAccountsResponse> {
		let callingUrl: string = settings.playerAccountsUri + '/login3';
		let loginRequest: I.LoginRequest = {
			email: player.email,
			password: player.password
		};

		return this.call(callingUrl, player, loginRequest).then((response: any) => {
			assert.ok(response.email != null && typeof response.email === 'string', "missing email from login3 response");
			assert.ok(response.playerName != null && typeof response.playerName === 'string', "missing playerName from login3 response");
			assert.ok(response.sessionToken != null && typeof response.sessionToken === 'string', "missing sessionToken from login3 response");

			return {
				email: response.email,
				playerName: response.playerName,
				sessionToken: response.sessionToken
			};
		});
	}

	private verifyEmail(player: I.Player): Q.Promise<void> {
		let callingUrl: string = settings.playerAccountsUri + '/setPlayerAccountInfo';
		let verifyEmailRequest: I.VerifyEmailRequset = {
			playerUniqueName: player.uniquePlayerName,
			verified: true,
			currentXP: 0,
			currentLevel: 1,
			wins: 0,
			losses: 0,
			playerInventory: JSON.stringify(["RoboMeister"])
		}

		return this.call(callingUrl, player, verifyEmailRequest).then((response: any) => {
			assert.ok(typeof response === 'string', "missing success from verifyEmail response");
			let jsonResponse = JSON.parse(response);
			assert.ok(typeof jsonResponse["verified"] === 'boolean' && jsonResponse["verified"], "missing verified from verifyEmail response");
			return;
		});
	}

	private deletePlayer(player: I.Player): Q.Promise<I.DeletePlayerResponse> {
		let callingUrl: string = settings.playerAccountsUri + '/deletePlayer2';
		let deletePlayerRequest: I.DeletePlayerRequest = {
			playerName: player.playerName,
			password: player.password
		};

		return this.call(callingUrl, player, deletePlayerRequest).then((response: any) => {
			assert.ok(response.success != null && typeof response.success === 'boolean', "missing success from deletePlayer2 response");

			return {
				success: response.success
			};
		});
	}

	private getPlayerStats(player: I.Player): Q.Promise<void> {
		let callingUrl: string = settings.playerStatsUri + '/v1/getPlayerStats';
		let getPlayersStatsRequest: I.GetPlayersStatsRequest = {
			sessionToken: player.session.sessionToken,
			playerNames: [player.playerName]
		}
		return this.callPlayerStats(callingUrl, player, getPlayersStatsRequest).then((response: any) => {
			assert.ok(response.playerStatsList != null, "missing playerStatsList from getPlayerStats response: " + JSON.stringify(response));
			assert.ok(response.playerStatsList[0] != null, "missing playerStatsList from playerStatsList[0] response: " + JSON.stringify(response));
			assert.ok(response.playerStatsList[0].gamesPlayed != null, "missing gamesPlayed from getPlayerStats response: " + JSON.stringify(response));
			player.gamesPlayed = response.playerStatsList[0].gamesPlayed;
		});
	}

	private getPlayerInventory(player: I.Player): Q.Promise<void> {
		let callingUrl: string = settings.playerStatsUri + '/v1/getPlayerInventory';
		let getPlayerInventoryRequest: I.GetPlayerInventoryRequest = {
			playerName: player.playerName
		}
		return this.callPlayerStats(callingUrl, player, getPlayerInventoryRequest).then((response: any) => {
			assert.ok(response.inventoryIds != null, "missing inventoryIds from getPlayerInventory response: " + JSON.stringify(response));
		});
	}

	private makeChatServerSocket(player: I.Player, chatRoomName: String): Q.Promise<void> {
		let deferred: Q.Deferred<any> = Q.defer();
		let socket: net.Socket = new net.Socket();
		player.session.chatServerSplitter = new SplitStreamOnNewJSON();
		player.session.chatServerSocket = socket;
		let onSocketData: Function = function handleSocketData(data: any) {
			player.session.chatServerSplitter.lookForJSON(data);
		};
		socket.on('data', onSocketData);
		socket.on('error', (error) => {
			deferred.reject(error);
		});
		socket.on('end', () => {
			logger.info("Response-ChatServer-end", { playerName: player.playerName, status: player.session.status });
		});
		socket.on('connect', (data: any) => {
			logger.info("Response-ChatServer-onData", { playerName: player.playerName, status: player.session.status, data: data, chatRooName: chatRoomName });
		});

		socket.connect(settings.chatServersSocketPort, settings.chatServersSocketHost);

		let connectionJson: any = {
			room: chatRoomName,
			name: player.playerName
		}
		let message = JSON.stringify(connectionJson) + "\n";
		socket.write(new Buffer(message, 'utf8'), () => {
			deferred.resolve();
		});
		return deferred.promise;
	}

	private sendChatServerMessage(player: I.Player): Q.Promise<any> {
		let deferred: Q.Deferred<any> = Q.defer();
		let onData: Function = function handleChatData(chunk: any) {
			try {
				let obj: any = JSON.parse(chunk);

				if (obj.commandType == PlayerRunner.SEND_MESSAGE_COMMAND_TYPE && obj.message == player.playerName + ": " + PlayerRunner.SEND_MESSAGE_CONTENT) {
					logger.info("Response-ChatServer-onData-sendMessage", { playerName: player.playerName, status: player.session.status, message: JSON.stringify(obj) });
					player.session.chatServerSplitter.removeListener('data', handleChatData);
					deferred.resolve(obj);
				}
			} catch (err) {
				logger.error("Response-ChatServer-onData-sendMessage-error", { playerName: player.playerName, status: player.session.status, err: err });
			}
		};

		player.session.chatServerSplitter.on('data', onData);
		player.session.chatServerSocket.on('error', (error) => {
			deferred.reject(error);
		});

		let sendMessageRequest: any = {
			commandType: PlayerRunner.SEND_MESSAGE_COMMAND_TYPE,
			message: PlayerRunner.SEND_MESSAGE_CONTENT
		};
		let stringifiedMessage = JSON.stringify(sendMessageRequest) + "\n";
		player.session.chatServerSocket.write(new Buffer(stringifiedMessage, 'utf8'));

		return deferred.promise;
	}

	private getUsersInChat(player: I.Player, chatroom: string): Q.Promise<any> {
		let deferred: Q.Deferred<any> = Q.defer();
		let onData: Function = function handleChatData(chunk: any) {
			try {
				let obj: any = JSON.parse(chunk);

				if (obj.commandType == PlayerRunner.GET_USERS_COMMAND_TYPE) {
					logger.info("Response-ChatServer-onData-getUsers", { playerName: player.playerName, status: player.session.status, message: JSON.stringify(obj) });
					player.session.chatServerSplitter.removeListener('data', handleChatData);
					deferred.resolve(obj);
				}
			} catch (err) {
				logger.error("Response-ChatServer-onData-getUsers-error", { playerName: player.playerName, status: player.session.status, err: err });
			}
		};

		player.session.chatServerSplitter.on('data', onData);
		player.session.chatServerSocket.on('error', (error) => {
			deferred.reject(error);
		});

		let getUsersRequest: any = {
			commandType: PlayerRunner.GET_USERS_COMMAND_TYPE,
			room: chatroom
		};
		let stringifiedMessage = JSON.stringify(getUsersRequest) + "\n";
		player.session.chatServerSocket.write(new Buffer(stringifiedMessage, 'utf8'));

		return deferred.promise;
	}

	private switchToChatRoom(player: I.Player, room: string): Q.Promise<any> {
		let deferred: Q.Deferred<any> = Q.defer();
		player.session.chatServerSocket.on('error', (error) => {
			deferred.reject(error);
		});

		let switchRoomRequest: any = {
			commandType: PlayerRunner.SWITCH_ROOM_COMMAND_TYPE,
			room: room
		};
		let stringifiedMessage = JSON.stringify(switchRoomRequest) + "\n";
		player.session.chatServerSocket.write(new Buffer(stringifiedMessage, 'utf8'), () => {
			deferred.resolve();
		});

		return deferred.promise;
	}

	private listGames(player: I.Player): Q.Promise<Array<I.LobbyListing>> {
		let callingUrl: string = settings.lobbiesLoadBalancedUri + '/listGames';
		let listGamesRequest: I.ListGamesRequest = {
			playerName: player.playerName,
			sessionToken: player.session.sessionToken
		}
		return this.call(callingUrl, player, listGamesRequest).then((response: any) => {
			assert.ok(response != null && Array.isArray(response), "missing response that is an array");
			return response;
		});
	}

	private hostGame(player: I.Player): Q.Promise<I.Game> {
		let callingUrl: string = settings.lobbiesLoadBalancedUri + '/hostGame';
		let hostGameRequest: I.HostGameRequest = {
			playerName: player.playerName,
			sessionToken: player.session.sessionToken,
			gameName: "GameName " + player.playerName,
			mapName: PlayerRunner.MAP_NAME,
			gameType: PlayerRunner.GAME_TYPE
		}
		return this.call(callingUrl, player, hostGameRequest).then((response: any) => {
			assert.ok(response.connectionKey != null && typeof response.connectionKey === 'string', "Missing connectionKey in response.");
			assert.ok(response.gameGUID != null && typeof response.gameGUID === 'string', "Missing gameGUID in response.");
			assert.ok(response.gameName != null && typeof response.gameName === 'string', "Missing gameName in response.");
			assert.ok(response.host != null && typeof response.host === 'string', "Missing host in response.");
			assert.ok(response.httpEndpoint != null && typeof response.httpEndpoint === 'string', "Missing httpEndpoint in response.");
			assert.ok(response.port != null && typeof response.port === 'string', "Missing port in response.");

			return {
				connectionKey: response.connectionKey,
				gameGUID: response.gameGUID,
				gameName: response.gameName,
				host: response.host,
				httpEndpoint: response.httpEndpoint,
				port: response.port
			};
		});
	}

	private makeLobbiesSocket(player: I.Player): Q.Promise<any> {
		let deferred: Q.Deferred<any> = Q.defer();
		let socket: net.Socket = new net.Socket();
		player.session.lobbiesSplitter = new SplitStreamOnNewJSON();
		player.session.lobbiesSocket = socket;
		let onSocketData: Function = function handleSocketData(data: any) {
			player.session.lobbiesSplitter.lookForJSON(data);
		};
		socket.on('data', onSocketData);

		let onSplitterData: Function = function handleSplitterData(chunk: any) {
			try {
				let obj: any = JSON.parse(chunk);
				if (obj.command == PlayerRunner.UPDATE_GAME_INFO_COMMAND) {
					logger.info("Response-Lobbies-onData-updateGameInfo", { playerName: player.playerName, status: player.session.status, obj: JSON.stringify(obj) });
					player.session.lobbiesSplitter.removeListener('data', handleSplitterData);
					deferred.resolve(true);
				}
			} catch (err) {
				logger.info("Response-Lobbies-onData-updateGameInfo-error", { playerName: player.playerName, status: player.session.status, err: err });
			}
		};
		player.session.lobbiesSplitter.on('data', onSplitterData);

		socket.on('error', (error) => {
			logger.error("Response-Lobbies-error", { playerName: player.playerName, status: player.session.status, error: error });
			deferred.reject(error);
		});
		socket.on('end', () => {
			logger.info("Response-Lobbies-end", { playerName: player.playerName, status: player.session.status });
			deferred.resolve(false);
		});
		socket.on('connect', (data: any) => {
			logger.info("Response-Lobbies-connect", { playerName: player.playerName, status: player.session.status, gameName: player.session.game.gameName });
		});

		socket.connect(parseInt(player.session.game.port, 10), player.session.game.host);
		let connectionJson = {
			gameGUID: player.session.game.gameGUID,
			playerName: player.playerName,
			connectionKey: player.session.game.connectionKey
		}
		let message = JSON.stringify(connectionJson);
		socket.write(new Buffer(message, 'ascii'), () => { })

		return deferred.promise
	}

	private chooseCommander(player: I.Player, commander: string): Q.Promise<any> {
		return this.updateLobbyInfo(player, "chooseCommander", commander);
	}

	private updateLobbyInfo(player: I.Player, lobbyCommand: string, lobbyCommandParameters: string): Q.Promise<any> {
		let callingUrl: string = player.session.game.httpEndpoint + 'v1/updateLobbyInfo/' + lobbyCommand;
		let updateLobbyInfoRequest: I.UpdateLobbyInfoRequest = {
			playerName: player.playerName,
			sessionToken: player.session.sessionToken,
			gameGUID: player.session.game.gameGUID,
			lobbyCommandParameters: lobbyCommandParameters
		};
		return this.call(callingUrl, player, updateLobbyInfoRequest);
	}

	private connectToMockGameServer(player: I.Player, connectionInfo: I.ConnectionInfo): Q.Promise<any> {
		let callingUrl: string = "http://" + connectionInfo.serverHostName + ":" + connectionInfo.publicPort + "/connectPlayer";
		let requestBody: I.ConnectPlayerRequest = {
			playerName: player.playerName,
			allyId: 0
		};
		return this.call(callingUrl, player, requestBody);
	}
	private getEndGamePlayerStats(player: I.Player, playerNames: Array<string>): Q.Promise<void> {
		let callingUrl: string = settings.playerStatsUri + '/v1/getEndGamePlayerStats';
		let getEndGamePlayerStatsRequest: I.GetEndGamePlayerStatsRequest = {
			callingPlayerName: player.playerName,
			playerNames: playerNames,
			sessionToken: player.session.sessionToken,
			newGamesPlayed: player.gamesPlayed + 1
		};
		return this.callPlayerStats(callingUrl, player, getEndGamePlayerStatsRequest).then((response: any) => {
			assert.ok(response.endGamePlayerStats != null, "missing endGamePlayerStats from getEndGamePlayerStats response: " + JSON.stringify(response));
		});
	}

	private lockCommander(player: I.Player): Q.Promise<any> {
		let deferred: Q.Deferred<any> = Q.defer();

		let onData: Function = function handleSocketData(chunk: any) {
			try {
				let obj: any = JSON.parse(chunk);

				if (obj.command == PlayerRunner.UPDATE_GAME_INFO_COMMAND && obj.body != null && obj.body.status == PlayerRunner.LOBBY_INFO_STATE_IN_GAME) {
					logger.info("Response-Lobbies-onData-updateGameInfo", { playerName: player.playerName, status: player.session.status, obj: JSON.stringify(obj) });

					assert.ok(obj.body.endpoint != null, "endpoint doesn't exist");
					assert.ok(obj.body.endpoint.serverHostName != null && typeof obj.body.endpoint.serverHostName === 'string', "serverHostName doesn't exist");
					assert.ok(obj.body.endpoint.publicPort != null && typeof obj.body.endpoint.publicPort === 'string', "publicPort doesn't exist");

					let connectionInfo: I.ConnectionInfo = {
						publicPort: obj.body.endpoint.publicPort,
						serverHostName: obj.body.endpoint.serverHostName
					};

					player.session.lobbiesSplitter.removeListener('data', handleSocketData);

					deferred.resolve(connectionInfo);
				}
			} catch (err) {
				logger.info("Response-Lobbies-onData-updateGameInfo-error", { playerName: player.playerName, status: player.session.status, err: err });
			}
		};

		player.session.lobbiesSplitter.on('data', onData);
		player.session.lobbiesSocket.on('error', (error) => {
			deferred.reject(error);
		});

		return this.updateLobbyInfo(player, "lockCommander", null).then(() => {
			return deferred;
		});
	}

	//For multiple people games
	private joinGame(player: I.Player): Q.Promise<I.JoinGameResponse> {
		let callingUrl: string = settings.lobbiesLoadBalancedUri + '/joinGame';
		let joinGameRequest: I.JoinGameRequest = {
			playerName: player.playerName,
			sessionToken: player.session.sessionToken,
			gameGUID: player.session.game.gameGUID
		}
		return this.call(callingUrl, player, joinGameRequest, PlayerRunner.assertResponseIsValidForJoinGame).then((response: any) => {
			return response;
		});
	}

	private changeStatus(player: I.Player, status: string) {
		logger.info("this.changeStatus", { playerName: player.playerName, from: player.session.status, to: status });
		player.session.status = status;
	}
}
export = PlayerRunner;