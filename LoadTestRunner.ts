import Q = require('q');
import assert = require('assert');
import I = require('./Interfaces');
let logger = require('./logger');
import PlayerRunner = require('./PlayerRunner');

class LoadTestRunner {
	private readonly playerRunner: PlayerRunner;
	private readonly players: Array<I.Player>;
	private readonly duration: number;
	private readonly rampDuration: number;
	private readonly runnerCleanup: I.RunnerCleanup;

	private scheduleRampUpTimer: NodeJS.Timer;
	private scheduleRampDownTimer: NodeJS.Timer;
	private scheduleRunnerFinishedTimer: NodeJS.Timer;
	private startTimers: Array<NodeJS.Timer> = new Array<NodeJS.Timer>();
	private stopTimers: Array<NodeJS.Timer> = new Array<NodeJS.Timer>();

	constructor(runnerCleanup: I.RunnerCleanup, playerRunner: PlayerRunner, players: Array<I.Player>, duration: number, rampDuration: number) {
		this.runnerCleanup = runnerCleanup;
		this.playerRunner = playerRunner;
		this.players = players;
		this.duration = duration;
		this.rampDuration = rampDuration;
	}

	private assertIsInt(thing: any, nameOfField: string) {
		assert(typeof thing === 'string', "Missing " + nameOfField);
		let maybeInt = parseInt(thing, 10);
		assert(!isNaN(maybeInt), "Missing " + nameOfField);
	}

	private scheduleRampUp(): void {
		for (let i: number = 0; i < this.players.length; i++) {
			let delayTime: number = i * (this.rampDuration / this.players.length);

			let timer: NodeJS.Timer = setTimeout(() => {
				this.playerRunner.start(this.players[i]);
			}, delayTime);
			this.startTimers.push(timer);
		}
	}

	private scheduleRampDown(): void {
		for (let i: number = 0; i < this.players.length; i++) {
			let delayTime: number = i * (this.rampDuration / this.players.length);

			let timer: NodeJS.Timer = setTimeout(() => {
				this.playerRunner.stop(this.players[i]);
			}, delayTime);
			this.stopTimers.push(timer);
		}
	}

	public run(): Q.Promise<I.RunResponse> {
		return Q.fcall(() => {
			this.scheduleRampUpTimer = setTimeout(() => {
				this.scheduleRampUp();
			}, 1000);
			this.scheduleRampDownTimer = setTimeout(() => {
				this.scheduleRampDown();
			}, this.duration - this.rampDuration - 1000);
			this.scheduleRunnerFinishedTimer = setTimeout(() => {
				this.players.forEach((player) => {
					let playerReport: I.PlayerReport = this.generatePlayerReport(player);
					logger.info("PlayerReport", playerReport);
				});
				let loadTestReport: I.LoadTestReport = this.generateLoadTestReport();
				logger.info("LoadTestReport", loadTestReport);

				this.runnerCleanup.runnerFinished();
			}, this.duration);
		}).then(() => {
			return { success: true };
		});
    }

	public stop(): Q.Promise<I.StopResponse> {
		return Q.fcall(() => {
			clearTimeout(this.scheduleRampUpTimer);
			clearTimeout(this.scheduleRampDownTimer);
			clearTimeout(this.scheduleRunnerFinishedTimer);
			for (let i: number = 0; i < this.startTimers.length; i++) {
				clearTimeout(this.startTimers[i]);
			}
			for (let i: number = 0; i < this.stopTimers.length; i++) {
				clearTimeout(this.stopTimers[i]);
			}

			setTimeout(() => {
				this.scheduleRampDown();
			}, 1000);
            setTimeout(() => {
				this.runnerCleanup.runnerFinished();
			}, this.rampDuration + 1000);
		}).then(() => {
			return { success: true };
		});
    }

    public generateLoadTestReport(): I.LoadTestReport {
        let loopsEndedSuccessfully: number = this.players.reduce((total, currentPlayer) => total + currentPlayer.loopsEndedSuccessfully, 0);
        let loopsStarted: number = this.players.reduce((total, currentPlayer) => total + currentPlayer.loopsStarted, 0);

		return {
			loopsEndedSuccessfully: loopsEndedSuccessfully,
			loopsStarted: loopsStarted
		};
	}



	public generatePlayerReport(player: I.Player): I.PlayerReport {
		return {
			isHost: player.isHost ? "true" : "false",
			loopsEndedSuccessfully: player.loopsEndedSuccessfully,
			loopsStarted: player.loopsStarted,
			playerName: player.playerName
		};
	}

}
export = LoadTestRunner;