import express = require('express');
import routes = require('./routes/index');
import user = require('./routes/user');
import morgan = require('morgan');
import favicon = require('serve-favicon');
import serveStatic = require('serve-static');
let bodyParser = require('body-parser');
import http = require('http');
import Q = require('q');

import path = require('path');
import I = require('./Interfaces');
import PlayerSessionFactory = require('./PlayerSessionFactory');
import LoadTestOrchestrator = require('./LoadTestOrchestrator');
import PlayerRunner = require('./PlayerRunner');

let logger = require('./logger');
let settings: I.Settings = require('./config/settings');

process.env.UV_THREADPOOL_SIZE = 128;

let app = express();

app.use(serveStatic(path.join(__dirname, 'public')));
app.use(favicon(__dirname + '/public/images/favicon.ico'));
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');
app.use(morgan('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

let playerSessionFactory = new PlayerSessionFactory();
let playerRunner = new PlayerRunner(playerSessionFactory);
let loadTestOrchestrator = new LoadTestOrchestrator(playerRunner, playerSessionFactory);

function successResponseHandler(responsePayload: any, res: express.Response, req: any) {
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
	res.json(responsePayload);
	res.status(200);
}

function failResponseHandler(err: any, res: express.Response, req: any) {
	let errorMessage;
	if (err && err.message) {
		errorMessage = err.message;
	}
	logger.error("Error Message: " + errorMessage, err);
	res.json({ error: errorMessage });
	res.status(500);
}


app.get('/admin', (req, res) => {
	res.render('index', { data: {} });
});

app.post('/admin/start', (req, res) => {
	Q.fcall(() => {
		return loadTestOrchestrator.start(req.body);
	}).then((responsePayload: any) => {
		successResponseHandler(responsePayload, res, req);
	}).catch((err) => {
		failResponseHandler(err, res, req);
	});
});

app.post('/admin/stop', (req, res) => {
	Q.fcall(() => {
		return loadTestOrchestrator.stop(req.body);
	}).then((responsePayload: any) => {
		successResponseHandler(responsePayload, res, req);
	}).catch((err) => {
		failResponseHandler(err, res, req);
	});
});

app.post('/run', (req, res) => {
	Q.fcall(() => {
		return loadTestOrchestrator.run(req.body);
	}).then((responsePayload: any) => {
		successResponseHandler(responsePayload, res, req);
	}).catch((err) => {
		failResponseHandler(err, res, req);
	});
});

app.post('/stopRun', (req, res) => {
	Q.fcall(() => {
		return loadTestOrchestrator.stopRun(req.body);
	}).then((responsePayload: any) => {
		successResponseHandler(responsePayload, res, req);
	}).catch((err) => {
		failResponseHandler(err, res, req);
	});
});

process.on('uncaughtException', function (err: any) {
	logger.error(err.stack);
	logger.info("Node NOT Exiting...");
	debugger;
});

app.all('*', (req: any, res: any) => {
	res.status(404);
	res.write("404");
	res.end();
});

app.listen(settings.httpPort);

logger.info("LoadTest has started");
let printableSettings: any = settings;
logger.info(JSON.stringify(printableSettings.__proto__, null, 2));