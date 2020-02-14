var express = require('express');
var firebase = require('firebase');
var https = require('https');

var server_port = process.env.PORT || 5000;
var signup_key = process.env.SIGNUPKEY;

var app = express();

// ---- To allow CORS -----
app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});
app.use(express.urlencoded());  // for parsing application/x-www-form-urlencoded
app.use(express.json());        // for parsing application/json

// ---- TextBin Instance ------
var configTB = {
    apiKey: process.env.TBWEBAPIKEY,
    authDomain: "textbin-9ca75.firebaseapp.com",
    databaseURL: "https://textbin-9ca75.firebaseio.com",
    storageBucket: "textbin-9ca75.appspot.com"
};
firebase.initializeApp(configTB);
var databaseTB = firebase.app().database();

// ---- WeBal Instance ------
var configWB = {
    apiKey: process.env.WBWEBAPIKEY,
    authDomain: "webal-c8223.firebaseapp.com",
    databaseURL: "https://webal-c8223.firebaseio.com/",
    storageBucket: "webal-c8223.appspot.com"
};
firebase.initializeApp(configWB, 'wbapp');
var databaseWB = firebase.app('wbapp').database();

/*******************************
 *     TEXTBIN Endpoints
 ******************************/
app.get('/textbin/:ownkey', function(req, res) {
    var ownkey = req.params.ownkey;
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
});
app.post('/textbin/:ownkey', function(req, res) {
    var ownkey = req.params.ownkey;
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
});

/*******************************
 *     WEBAL Endpoints
 ******************************/
app.get('/webal/:pkey', function(req, res) {
	var rootRef = databaseWB.ref();
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
});
app.get('/webal/:pkey/:eid', function(req, res) {
	var rootRef = databaseWB.ref();
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
});
app.post('/webal/:pkey/:eid', function(req, res) {
	var rootRef = databaseWB.ref();
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
});

/*******************************
 *     PaymentJS Endpoints
 ******************************/
app.get('/pjsproxy/:inskey/PayeezyResponse', function(req, res) {
    var inskey = req.params.inskey;
    if(inskey == "tdprodnam")
	    res.status(200).send('{"status":"OK"}');
	else
		res.status(404).send('{"status":"NOTFOUND"}');
});
app.post('/pjsproxy/:inskey/PayeezyResponse', function(req, res) {
    var inskey = req.params.inskey;
    if(inskey == "tdprodnam" && req.header('Client-Token') != "" && req.header('nonce') != "") {
    	var data = req.body;
    	var respCode = 200;
    	var options = {
		  hostname: 'production-nam-torrid.demandware.net',
		  port: 443,
		  path: '/s/torrid/payeezyAuthResponse',
		  method: 'POST',
		  headers: {
			'Content-Type': req.header('Content-Type'),
			'Client-Token': req.header('Client-Token'),
			'nonce': req.header('nonce'),
			'Authorization': 'Basic c3RvcmVmcm9udDp0YWNvczIwMTg=',
			'Content-Length': data.length
		  }
		}
		var req = https.request(options, (res) => {
			respCode = res.statusCode;
			res.on('data', (d) => {
				res.status(respCode).send(d);
			});
		});
		req.on('error', (error) => {
			console.error(error);
			res.status(500).send('{"status":"ERROR"}');
		});
		req.write(data);
		req.end();
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
		} else if(req.param('app') == "webal" && req.param('skey') == signup_key) {
			var rootRef = databaseWB.ref();
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
		} else {
			res.status(200).send('Invalid app or key');
		}
    } else {
    	res.status(200).send('Missing required data');
    }
});
app.get('/', function(req, res) {
   res.status(200).send('<br/><center><h2>Welcome to JK\'s Node module Home</h2><p>Well, there\'s nothing to view here...</p></center>');
});

/*******************************
 *     Startup App
 ******************************/
app.listen(server_port, function () {
    console.log( "Listening to " + server_port  );
});