import I = require('./Interfaces');
import Q = require('q');
import assert = require('assert');
import request = require('request');
let logger = require('./logger');
let settings: I.Settings = require('./config/settings');
import PlayerSessionFactory = require('./PlayerSessionFactory');
import LoadTestRunner = require('./LoadTestRunner');
import PlayerRunner = require('./PlayerRunner');

class LoadTestOrchestrator implements I.RunnerCleanup {
	private readonly playerRunner: PlayerRunner;
	private loadTestRunner: LoadTestRunner;
	private readonly playerSessionFactory: PlayerSessionFactory;

	constructor(playerRunner: PlayerRunner, playerSessionFactory: PlayerSessionFactory) {
		this.playerRunner = playerRunner;
		this.playerSessionFactory = playerSessionFactory;
	}

	private assertIsInt(thing: any, nameOfField: string) {
		assert(typeof thing === 'string', "Missing " + nameOfField);
		let maybeInt = parseInt(thing, 10);
		assert(!isNaN(maybeInt), "Missing " + nameOfField);
	}

	public start(reqBody: any): Q.Promise<I.StartResponse> {
		return Q.fcall(() => {
			assert(reqBody.numPlayers !== null, "reqBody is missing numPlayers");
			this.assertIsInt(reqBody.numPlayers, "numPlayers");

			assert(reqBody.duration !== null, "reqBody is missing duration");
			this.assertIsInt(reqBody.duration, "duration");

			assert(reqBody.rampDuration !== null, "reqBody is missing rampDuration");
			this.assertIsInt(reqBody.rampDuration, "rampDuration");

			let startRequest: I.StartRequest = {
				numPlayers: parseInt(reqBody.numPlayers, 10),
				duration: parseInt(reqBody.duration, 10),
				rampDuration: parseInt(reqBody.rampDuration, 10)
			};

			logger.info("Starting Load Test with...");
			logger.info(JSON.stringify(startRequest));

			let loadTestRunPromises: Array<Q.Promise<any>> = new Array<Q.Promise<any>>();
			for (let i: number = 0; i < settings.loadTestUris.length; i++) {
				let deferred: Q.Deferred<any> = Q.defer<any>();

				let uri: string = settings.loadTestUris[i] + ":" + settings.httpPort + "/run";
				request.post({
					uri: uri,
					timeout: settings.timeoutForRequestPost,
					json: true,
					form: {
						numPlayers: Math.round(startRequest.numPlayers / settings.loadTestUris.length),
						duration: startRequest.duration,
						rampDuration: startRequest.rampDuration
					}
				}, (error: any, response: any, body: any) => {
					if (error) {
						logger.error("Error in LoadTestOrchestrator on " + uri + "\n" + JSON.stringify(error));
						deferred.reject(error);
						return;
					}

					logger.info("Body of LoadTestOrchestrator response on " + uri + "\n" + JSON.stringify(body));

					deferred.resolve(body);
				});
				loadTestRunPromises.push(deferred.promise);
			}
			return Q.all(loadTestRunPromises);
		}).then((responses: any) => {
			for (let i: number = 0; i < responses.length; i++) {
				if (!responses[i].success) {
					return { success: false };
				}
			}
			return { success: true };
		});
	}

	public stop(reqBody: any): Q.Promise<I.StopResponse> {
		return Q.fcall(() => {
			logger.info("Forcing a stop on Load Test");

			let loadTestRunPromises: Array<Q.Promise<any>> = new Array<Q.Promise<any>>();
			for (let i: number = 0; i < settings.loadTestUris.length; i++) {
				let deferred: Q.Deferred<any> = Q.defer<any>();

				let uri: string = settings.loadTestUris[i] + ":" + settings.httpPort + "/stopRun";
				request.post({
					uri: uri,
					timeout: settings.timeoutForRequestPost,
				}, (error: any, response: any, body: any) => {
					if (error) {
						logger.error("Error in LoadTestOrchestrator on " + uri + "\n" + JSON.stringify(error));
						deferred.reject(error);
						return;
					}

					logger.info("Body of LoadTestOrchestrator response on " + uri + "\n" + JSON.stringify(body));

					deferred.resolve(body);
				});
				loadTestRunPromises.push(deferred.promise);
			}
			return Q.all(loadTestRunPromises);
		}).then((responses: any) => {
			for (let i: number = 0; i < responses.length; i++) {
				if (!responses[i].success) {
					return { success: false };
				}
			}
			return { success: true };
		});
	}

	public run(reqBody: any): Q.Promise<I.RunResponse> {
		return Q.fcall(() => {
			assert(reqBody.numPlayers !== null, "reqBody is missing numPlayers");
			this.assertIsInt(reqBody.numPlayers, "numPlayers");

			assert(reqBody.duration !== null, "reqBody is missing duration");
			this.assertIsInt(reqBody.duration, "duration");

			assert(reqBody.rampDuration !== null, "reqBody is missing rampDuration");
			this.assertIsInt(reqBody.rampDuration, "rampDuration");

			let runRequest: I.RunRequest = {
				numPlayers: parseInt(reqBody.numPlayers, 10),
				duration: parseInt(reqBody.duration, 10),
				rampDuration: parseInt(reqBody.rampDuration, 10)
			};

			if (this.loadTestRunner) {
				return { success: false };
			}

			logger.info("Running Load Test with...");
			logger.info(JSON.stringify(runRequest));

			let players: Array<I.Player> = this.generatePlayers(runRequest.numPlayers);

			this.loadTestRunner = new LoadTestRunner(this, this.playerRunner, players, runRequest.duration, runRequest.rampDuration);
			this.loadTestRunner.run();

			return { success: true };
		});
	}

	public stopRun(reqBody: any): Q.Promise<I.StopRunResponse> {
		return Q.fcall(() => {
			if (this.loadTestRunner == null) {
				return { success: false };
			}

			logger.info("Stopping Load Test run with...");

			this.loadTestRunner.stop();
			return { success: true };
		});
	}

	public runnerFinished(): void {
        logger.info("Finished Load Test");
		delete this.loadTestRunner;
	}

	public generatePlayers(playerNumber: number): Array<I.Player> {
		let players: Array<I.Player> = new Array<I.Player>();

		for (let i: number = 0; i < playerNumber; i++) {
			let player: I.Player = this.generatePlayerFromIndex(i);
			players.push(player);
		}

		return players;
	}

	public generatePlayerFromIndex(i: number): I.Player {
		let randomNumber: number = Math.round(Math.random() * 1000000000);
		let playerName: string = "Player" + randomNumber;
		let password: string = "letmein" + randomNumber;
		let email: string = "email" + randomNumber + "@example.com";
		let isHost: boolean = i % 6 == 0;

		return {
			playerName: playerName,
			uniquePlayerName: playerName.toUpperCase(),
			password: password,
			email: email,
			accountCreated: false,
			loopTimer: null,
			shouldExit: false,
			gamesPlayed: -69,
			loopsStarted: 0,
			loopsEndedSuccessfully: 0,
			isHost: isHost,
			session: this.playerSessionFactory.generateSession()
		};
	}
}
export = LoadTestOrchestrator;