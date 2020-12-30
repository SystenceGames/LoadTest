import net = require('net');
import SplitStreamOnNewJSON = require('./SplitStreamOnNewJSON');

export interface Settings {
	httpPort: number;
	loadTestUris: Array<string>;
	timeoutForRequestPost: number;
	graylog2: Graylog2;
	lobbiesLoadBalancedUri: string;
	playerAccountsUri: string;
	playerStatsUri: string;
	chatServersSocketPort: number;
	chatServersSocketHost: string;
	motdToAccountCreationMs: number;
	loopEndToLoopStartMs: number;
	joinAllChatToSendMessageMs: number;
	sendMessageToGetUsersMs: number;
	getUsersToListGamesMs: number;
	listGamesToHostGameMs: number;
	switchChatroomToSendMessageMs: number;
	sendMessageToChangeMapMs: number;
	changeMapToLockTeamsMs: number;
	playersArriveToCommanderSelect: number;
	lockTeamsToChooseCommanderMs: number;
	chooseCommanderToSwitchCommanderMs: number;
	chooseCommanderToLockCommanderMs: number;
	lockCommanderToWaitForGameMs: number;
	inGameToConnectToMockUdkServerMs: number;
    gameEndToGetEndGameStats: number;
    requestMaxSockets: number;
    requestKeepAlive: boolean;
}

export interface Graylog2 {
	name: string;
	level: string;
	graylog: any;
	staticMeta: any;
}

export interface ConnectPlayerResponse {
	gameDurationMs: number;
}

export interface PlayerSession {
	status: string;
	sessionToken: string;
	game?: Game;
	chatServerSocket?: net.Socket;
	chatServerSplitter?: SplitStreamOnNewJSON;
	lobbiesSocket?: net.Socket;
	lobbiesSplitter?: SplitStreamOnNewJSON;
}

export interface Player {
	readonly playerName: string;
	readonly uniquePlayerName: string;
	readonly password: string;
	readonly email: string;
	readonly isHost: boolean;

	accountCreated: boolean;
	loopTimer: NodeJS.Timer;
	shouldExit: boolean;
	gamesPlayed: number;
	loopsStarted: number;
	loopsEndedSuccessfully: number;
	session: PlayerSession;
}

export interface GetEndGamePlayerStatsRequest {
	sessionToken: string;
	playerNames: Array<string>;
	newGamesPlayed: number;
	callingPlayerName: string;
}

export interface Game {
	connectionKey: string;
	gameGUID: string;
	gameName: string;
	host: string;
	httpEndpoint: string;
	port: string;
}

export interface ConnectPlayerRequest {
	playerName: string;
	allyId: number;
}

export interface ConnectionInfo {
	serverHostName: string;
	publicPort: string;
}

export interface PlayerAccountsResponse {
    sessionToken: string;
    playerName: string;
    email: string;
}

export interface StartRequest {
	numPlayers: number;
	duration: number;
	rampDuration: number;
}

export interface CreatePlayerRequest {
    playerName: string;
    password: string;
    email: string;
    birthDate: string;
}

export interface LoginRequest {
	email: string;
	password: string;
}

export interface DeletePlayerRequest {
	playerName: string;
	password: string;
}

export interface DeletePlayerResponse {
	success: boolean;
}

export interface VerifyEmailRequset {
	playerUniqueName: string;
	verified: boolean;
	currentXP: number;
	currentLevel: number;
	wins: number;
	losses: number;
	playerInventory: string;
}

export interface GetPlayersStatsRequest {
	sessionToken: string;
	playerNames: Array<string>;
}

export interface GetPlayerInventoryRequest {
	playerName: string;
}

export interface ListGamesRequest {
	playerName: string;
	sessionToken: string;
}

export interface HostGameRequest {
	playerName: string;
	sessionToken: string;
	gameName: string;
	mapName: string;
	gameType: string;
}

export interface JoinGameRequest {
	playerName: string;
	sessionToken: string;
	gameGUID: string;
}

export interface UpdateLobbyInfoRequest {
	playerName: string;
	sessionToken: string;
	gameGUID: string;
	lobbyCommandParameters: string;
}

export interface StartResponse {
	success: boolean;
}

export interface StopResponse {
	success: boolean;
}

export interface StopRunResponse {
	success: boolean;
}

export interface RunRequest {
	numPlayers: number;
	duration: number;
	rampDuration: number;
}

export interface RunResponse {
	success: boolean;
}

export interface RunnerCleanup {
	runnerFinished(): void;
}

export interface LoadTestReport {
    loopsEndedSuccessfully: number;
    loopsStarted: number;
}

export interface PlayerReport {
	isHost: string;
	loopsEndedSuccessfully: number;
	loopsStarted: number;
	playerName: string;
}

export interface UpdateGameInfoResponsePlayer {
	playerName: string;
	commanderSelected: string;
	commanderSelectState: string;
	teamNumber: number;
	isBot: boolean;
	botDifficulty: number;
}

export interface LobbyListing {
	gameName: string;
	mapName: string;
	gameType: string;
	numOfPlayers: number;
	maxPlayers: number;
	hostName: string;
	gameGUID: string;
	port: string;
	host: string;
	httpEndpoint: string;
}

export interface JoinGameResponse {
	connectionKey: string;
	gameName: string;
	gameType: string;
	mapName: string;
	numOfPlayers: number;
}