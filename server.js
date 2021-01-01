var express = require('express');
var firebase = require('firebase');
var rp = require('request-promise-native');

var server_port = process.env.PORT || 5000;
var signup_key = process.env.SIGNUPKEY;
var authAccount = (""+process.env.AUTHACCOUNT).split(",");
var pjsConfigObj = JSON.parse(process.env.PJSPROXYCONFIG);
var bopisConfigObj = JSON.parse(process.env.BOPISPROXYCONFIG);

var app = express();

// ---- To allow CORS -----
app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});
app.use(express.urlencoded());
app.use(express.bodyParser());

// ---- TextBin Instance ------
var configTB = JSON.parse(process.env.TBFIREBASECONFIG);
firebase.initializeApp(configTB);
var databaseTB = firebase.app().database();
var authTB = firebase.app().auth();

// ---- WeBal Instance ------
var configWB = JSON.parse(process.env.WBFIREBASECONFIG);
firebase.initializeApp(configWB, 'wbapp');
var databaseWB = firebase.app('wbapp').database();
var authWB = firebase.app('wbapp').auth();

// ---- AgendaList Instance ------
var configAL = JSON.parse(process.env.ALFIREBASECONFIG);
firebase.initializeApp(configAL, 'alapp');
var databaseAL = firebase.app('alapp').database();
var authAL = firebase.app('alapp').auth();

/*******************************
 *     TEXTBIN Endpoints
 ******************************/
app.get('/textbin/:ownkey', function(req, res) {
    var ownkey = req.params.ownkey;
    authTB.signInWithEmailAndPassword(authAccount[0], authAccount[1]).then(function(user) {
    	var rootRef = databaseTB.ref();
		var ownerRef = rootRef.child('Owners');
		var clipsRef = rootRef.child('Clips');
		var recRef = ownerRef.child(ownkey);
		
		recRef.once('value',function(snapshot) {
			if(snapshot != null && snapshot.val() != null) {
				var data = snapshot.val();
				if(data.enabled) {
					var limitCnt = (data.quota != null) ? data.quota : 10;
					var clipRecs = clipsRef.child(ownkey);
					var query = clipRecs.orderByChild('modified').limitToLast(limitCnt);
					query.once('value',function(snapshot) {
						var newArray = new Array();
						snapshot.forEach(function (childSnap) {
							var clip = childSnap.val();
							clip.id = childSnap.key;
							clip.data = new Buffer(clip.data, 'base64').toString("utf8");
							newArray.push(clip);
						});
						res.status(200).send('callbackClips({"clips":' + JSON.stringify(newArray) + ', "user":' + JSON.stringify(data) + '});');
					});
				} else {
					res.status(200).send('callbackClips({"error":"Not Enabled"});');
				}
			} else {
				res.status(200).send('callbackClips({"error":"Not Found"});');
			}
		});
	}).catch(function(error) {
		console.error("TB Auth Error: " + error.message);
		res.status(200).send('callbackClips({"error":"Access Denied"});');
	});
});
app.post('/textbin/:ownkey', function(req, res) {
    var ownkey = req.params.ownkey;
    
	authTB.signInWithEmailAndPassword(authAccount[0], authAccount[1]).then(function(user) {
		var rootRef = databaseTB.ref();
		var ownerRef = rootRef.child('Owners');
		var clipsRef = rootRef.child('Clips');
		
		if(req.param('clipMesg')) {
			var encClip = new Buffer(req.param('clipMesg'), "utf8").toString('base64');
			var newData = {
				"type" : "text",
				"data": encClip,
				"state": "N",
				"modified": (new Date()).getTime() * -1
			};
			var recRef = ownerRef.child(ownkey);
			recRef.once('value',function(snapshot) {
				if(snapshot != null && snapshot.val() != null) {
					var data = snapshot.val();
					if(data.enabled) {
						var dataRef = clipsRef.child(ownkey);
						dataRef.push(newData);
						res.redirect('/textbin/'+ownkey);
					} else {
						res.status(200).send('callbackClips({"error":"Not Enabled"});');
					}
				} else {
					res.status(200).send('callbackClips({"error":"Not Found"});');
				}
			});
		} else if(req.param('deleteId')) {
			var clipid = req.param('deleteId');
			var dataOwnRef = clipsRef.child(ownkey);
			var dataRef = dataOwnRef.child(clipid);
			dataRef.remove();
			res.redirect('/textbin/'+ownkey);
		}
	}).catch(function(error) {
		console.error("TB Auth Error: " + error.message);
		res.status(200).send('callbackClips({"error":"Access Denied"});');
	});
});

/*******************************
 *     WEBAL Endpoints
 ******************************/
app.get('/webal/:pkey', function(req, res) {
	var rootRef = databaseWB.ref();
	
	authWB.signInWithEmailAndPassword(authAccount[0], authAccount[1]).then(function(user) {
		var profRef = rootRef.child('Profiles');
		var entrRef = rootRef.child('Entries');

		var recRef = profRef.child(req.params.pkey);
		recRef.once('value',function(snapshot) {
			if(snapshot != null && snapshot.val() != null) {
				var data = snapshot.val();
				if(data.enabled) {
					var retData = new Object();
					var preData = data.preWebData;
					var postData = data.postWebData;
					var balance = preData;
				
					var entrRecs = entrRef.child(req.params.pkey);
					entrRecs.once('value',function(snapshot) {
						snapshot.forEach(function (childSnap) {
							var entry = childSnap.val();
							balance += parseFloat(entry.webBal);
						});
						balance -= postData;
						retData.dispName = data.dispName;
						retData.entryThreshold = data.entryThreshold;
						retData.savings = balance;
						res.status(200).send( JSON.stringify(retData) );
					});
				} else {
					res.status(200).send('{"error":"Not Enabled"}');
				}
			} else {
				res.status(200).send('{"error":"Not Found"}');
			}
		});
	}).catch(function(error) {
		console.error("WB Auth Error: " + error.message);
		res.status(200).send('{"error":"Access Denied"}');
	});
});
app.get('/webal/:pkey/:eid', function(req, res) {
	var rootRef = databaseWB.ref();
	
	authWB.signInWithEmailAndPassword(authAccount[0], authAccount[1]).then(function(user) {
		var entrRef = rootRef.child('Entries');
		var entrRecs = entrRef.child(req.params.pkey);
	
		entrRecs.once('value',function(snapshot) {
			if(snapshot != null && snapshot.val() != null) {
				var entryRecord;
				snapshot.forEach(function (childSnap) {
					var entry = childSnap.val();
					if(entry.webID == req.params.eid) {
						entryRecord = entry;
					}
				});
				if(entryRecord == null) {
					res.status(200).send('{"webData":"", "isLocked": false, "webThreshold": 0}');
				} else {
					var retVal = new Object();
					retVal.webData = new Buffer(entryRecord.webData, 'base64').toString("utf8");
					retVal.isLocked = entryRecord.isLocked;
					retVal.webThreshold = entryRecord.webThreshold;
					res.status(200).send( JSON.stringify(retVal) );
				}
			} else {
				res.status(200).send('{"webData":"", "isLocked": false, "webThreshold": 0}');
			}
		});
	}).catch(function(error) {
		console.error("WB Auth Error: " + error.message);
		res.status(200).send('{"webData":"", "isLocked": false, "webThreshold": 0}');
	});
});
app.post('/webal/:pkey/:eid', function(req, res) {
	var rootRef = databaseWB.ref();
	
	authWB.signInWithEmailAndPassword(authAccount[0], authAccount[1]).then(function(user) {
		var profRef = rootRef.child('Profiles');
		var entrRef = rootRef.child('Entries');

		var recRef = profRef.child(req.params.pkey);
		recRef.once('value',function(snapshot) {
			if(snapshot != null && snapshot.val() != null) {
				var data = snapshot.val();
				if(!data.enabled) {
					res.status(200).send('{"error":"Not Enabled"}');
				}
				var encData = new Buffer(req.param('webData'), "utf8").toString('base64');
				var webThreshold = parseFloat(req.param('webThreshold')).toFixed(2);
				var webBal = parseFloat(req.param('webBal')).toFixed(2);
			
				var entrRecs = entrRef.child(req.params.pkey);
				entrRecs.once('value',function(snapshot) {
					try {
						if(snapshot != null && snapshot.val() != null) {
							var entryRecord, entryKey;
							snapshot.forEach(function (childSnap) {
								var entry = childSnap.val();
								if(entry.webID == req.params.eid) {
									entryRecord = entry;
									entryKey = childSnap.key;
								}
							});
							if(entryRecord == null && req.param('webData') != "") {
								var newData = {
									"isLocked" : false,
									"webID": req.params.eid,
									"webThreshold": webThreshold,
									"webData": encData,
									"webBal": webBal
								};
								entrRef.child(req.params.pkey).push(newData);
								res.status(200).send('{"success":true}');
							} else {
								if(req.param('webData') != "") {
									entryRecord.webThreshold = webThreshold;
									entryRecord.webData = encData;
									entryRecord.webBal = webBal;
									entrRef.child(req.params.pkey).child(entryKey).set(entryRecord);
								} else {
									entrRef.child(req.params.pkey).child(entryKey).remove();
								}
								res.status(200).send('{"success":true}');
							}
						} else {
							var newData = {
								"isLocked" : false,
								"webID": req.params.eid,
								"webThreshold": webThreshold,
								"webData": encData,
								"webBal": webBal
							};
							entrRef.child(req.params.pkey).push(newData);
							res.status(200).send('{"success":true}');
						}
					} catch(e) {
						res.status(200).send('{"error":"Unable to set values " + ' + e + '}');
					}
				});
			} else {
				res.status(200).send('{"error":"Not Found"}');
			}
		});
	}).catch(function(error) {
		console.error("WB Auth Error: " + error.message);
		res.status(200).send('{"error":"Access Denied"}');
	});
});

/*******************************
 *   AGENDALIST Endpoints
 ******************************/
app.get('/agendalist/:pkey/:data', function(req, res) {
    res.status(200).send('{"error":"Access Denied"}');
});

/*******************************
 *   GETAPP Proxy Endpoints
 ******************************/
app.get('/getapp/:appsrc/:appname', function(req, res) {
    var appSrc = req.params.appsrc;
    var appName = req.params.appname;
    var reqUri = "";
    if(appSrc == "sfnet") {
    	reqUri = "https://svn.code.sf.net/p/jk9/code/trunk/jsapps/" + appName + ".htm";
    }
    var options = {
	  uri: reqUri,
	  method: 'GET'
	};
	if(reqUri != "") {
		rp(options).then(function (parsedBody) {
			res.status(200).send(parsedBody);
		}).catch(function (err) {
			res.status(200).send('<h3><font color="red">Error 500: </font>An error occurred loading the requested app</h3>');
		});
	} else {
		res.status(200).send('<h3><font color="red">Error 500: </font>An error occurred loading the requested app</h3>');
	}	
});

/*******************************
 *     BOPIS Proxy Endpoints
 ******************************/
app.post('/bopisproxy/oauth/token', function(req, res) {
    var token = bopisConfigObj.authToken.staticAccessToken;
    if(bopisConfigObj.authToken.mode == "simulated") {
    	if(token == "") {
			var characters = 'abcdefghijklmnopqrstuvwxyz0123456789';
			for ( var i = 0; i < 36; i++ ) {
				if(i==8 || i==13 || i==18 || i==23)
					token += '-';
				else
					token += characters.charAt(Math.floor(Math.random() * characters.length));
			}
		}
		if(req.params.username == "domadmin" && req.params.password == "password")
			res.status(200).send('{"access_token":"' + token + '","token_type":"bearer","refresh_token":"' + token + '","expires_in":86399,"scope":"read"}');
		else
			res.status(401).send('{"error":"unauthorized","error_description":"No AuthenticationProvider found for org.springframework.security.authentication.UsernamePasswordAuthenticationToken"}');
    }    
});
app.post('/bopisproxy/services/atc/getAvailabilityList', function(req, res) {
	try {
		var bodyData = JSON.parse(req.body);
		if(bopisConfigObj.authToken.mode == "simulated") {
			var items = bodyData.availabilityRequest.availabilityCriteria.itemNames.itemName;
			var facilities = bodyData.availabilityRequest.availabilityCriteria.facilityNames.facilityName;
			var responseBody = new Object();
			var availability = new Object();
			var availabilityDetails = new Object();
			var availabilityDetail = new Array();
			availability.viewName = bodyData.availabilityRequest.viewName;
			availability.viewConfiguration = "BOPIS";
			for (var i=0; i<items.length; i++) {
				for (var j=0; j<facilities.length; j++) {
					var availData = new Object();
					availData.businessUnit = 1;
					availData.facilityName = facilities[j];
					availData.itemName = items[i];
					var atc = Math.floor(Math.random() * 79);
					var atcStatus = (atc > 0) ? "In Stock" : "Out Of Stock";
					availData.atcQuantity = atc;
					availData.atcStatus = atcStatus;
					availData.dcGroupQuantity = 0;
					availData.storeGroupQuantity = 0;
					availData.baseUOM = "EA";
					availabilityDetail.push(availData);
				}
			}
			availabilityDetails.availabilityDetail = availabilityDetail;
			availability.availabilityDetails = availabilityDetails;
			responseBody.availability = availability;
			res.status(200).send(JSON.stringify(responseBody));
		}
	} catch(e) {
		res.status(401).send('{"availability":{"messages":{"message":{"severity":"ERROR","code":38120500,"description":"' + e + '"}}}}');
	}
});

/*******************************
 *     PaymentJS Endpoints
 ******************************/
app.get('/pjsproxy/:inskey/PayeezyResponse', function(req, res) {
    var inskey = req.params.inskey;
    if(pjsConfigObj.hasOwnProperty(inskey))
	    res.status(200).send('{"status":"OK"}');
    else
	    res.status(404).send('{"status":"NOTFOUND"}');
});
app.post('/pjsproxy/:inskey/PayeezyResponse', function(req, res, next) {
    var inskey = req.params.inskey;    
    if(pjsConfigObj.hasOwnProperty(inskey) && req.header('Client-Token') != "" && req.header('nonce') != "") {
    	var config = pjsConfigObj[inskey];
    	var data = req.body;
    	var respCode = 200;
        var reqUri = config.reqUri;
        var basicAuth = config.basicAuth;
        var options = {
          uri: reqUri,
          method: 'POST',
          headers: {
            'Content-Type': req.header('Content-Type'),
            'Client-Token': req.header('Client-Token'),
            'nonce': req.header('nonce'),
            'Authorization': 'Basic ' + basicAuth,
            'Content-Length': req.header('Content-Length')
          },
		  body : data,
		  json: true
        };
		rp(options).then(function (parsedBody) {
			res.status(200).send(parsedBody);
    	}).catch(function (err) {
			res.status(500).send('{"status":"ERROR"}');
    	});
    } else {
	    res.status(500).send('{"status":"ERROR"}');
    }
});

/*******************************
 *     GLOBAL Endpoints
 ******************************/
app.get('/signup', function(req, res) {
    if(req.param('user') && req.param('app') && req.param('skey')) {
    	if(req.param('app') == "textbin" && req.param('skey') == signup_key) {
			var rootRef = databaseTB.ref();
			authTB.signInWithEmailAndPassword(authAccount[0], authAccount[1]).then(function(user) {
				var ownerRef = rootRef.child('Owners');
				var clipRef = rootRef.child('Clips');
				var usersRef = ownerRef.push({
					username: req.param('user').charAt(0).toUpperCase() + req.param('user').substr(1),
					email: req.param('user')+"@email.com",
					enabled: true,
					quota: 20
				});
				var encClip = new Buffer("Welcome to your TextBin!", "utf8").toString('base64');
				var newData = {
					"type" : "text",
					"data": encClip,
					"state": "N",
					"modified": (new Date()).getTime() * -1
				};
				clipRef.child(usersRef.key).push(newData);
				res.status(200).send('New Account Created for: ' + req.param('user').charAt(0).toUpperCase() + req.param('user').substr(1) + ' <br/>\nAccount Key: ' + usersRef.key);
			}).catch(function(error) {
				console.error("TB Auth Error: " + error.message);
				res.status(200).send('Error Processing');
			});
		} else if(req.param('app') == "webal" && req.param('skey') == signup_key) {
			var rootRef = databaseWB.ref();
			authWB.signInWithEmailAndPassword(authAccount[0], authAccount[1]).then(function(user) {
				var profRef = rootRef.child('Profiles');
				var entRef = rootRef.child('Entries');
				var usersRef = profRef.push({
					dispName: req.param('user').charAt(0).toUpperCase() + req.param('user').substr(1),
					email: req.param('user')+"@email.com",
					entryThreshold: 130,
					postWebData: 0,
					preWebData: 0,
					enabled: true,
					quota: 52
				});
				var encData = new Buffer("", "utf8").toString('base64');
				var newData = {
					"isLocked" : false,
					"webID": 1,
					"webThreshold": 130,
					"webData": encData,
					"webBal": 0
				};
				entRef.child(usersRef.key).push(newData);
				res.status(200).send('New Account Created for: ' + req.param('user').charAt(0).toUpperCase() + req.param('user').substr(1) + ' <br/>\nAccount Key: ' + usersRef.key);
			}).catch(function(error) {
				console.error("WB Auth Error: " + error.message);
				res.status(200).send('Error Processing');
			});
		} else if(req.param('app') == "agendalist" && req.param('skey') == signup_key) {
			var rootRef = databaseAL.ref();
			authAL.signInWithEmailAndPassword(authAccount[0], authAccount[1]).then(function(user) {
				var profRef = rootRef.child('Profiles');
				var dataRef = rootRef.child('ProfileData');
				var usersRef = profRef.push({
					Name: req.param('user').charAt(0).toUpperCase() + req.param('user').substr(1),
					Email: req.param('user')+"@email.com",
					CreatedOn: new Date().getTime(),
					LastOnline: new Date().getTime(),
					Enabled: true,
					PlanType: ""
				});
				var newData = {
					"Tasks" : [],
					"Tags": [],
					"PinnedTasks": [],
					"Agenda": []
				};
				dataRef.child(usersRef.key).push(newData);
				res.status(200).send('New Account Created for: ' + req.param('user').charAt(0).toUpperCase() + req.param('user').substr(1) + ' <br/>\nAccount Key: ' + usersRef.key);
			}).catch(function(error) {
				console.error("AL Auth Error: " + error.message);
				res.status(200).send('Error Processing');
			});
		} else {
			res.status(200).send('Invalid app or key');
		}
    } else {
    	res.status(200).send('Missing required data');
    }
});
app.get('/', function(req, res) {
   res.status(200).send('<br/><center><h2>Welcome to JK\'s Node module Home</h2><p>Thanks for visiting, but, there\'s nothing to view here...</p></center>');
});

/*******************************
 *     Startup App
 ******************************/
app.listen(server_port, function () {
    console.log( "Listening to " + server_port  );
});
