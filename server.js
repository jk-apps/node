var express = require('express');
var firebase = require('firebase');
var cors = require('cors');	
var rp = require('request-promise-native');
var timeout = require('connect-timeout');
var parser = require('fast-xml-parser');

var server_port = process.env.PORT || 5000;
var signup_key = process.env.SIGNUPKEY;
var finhub_api_key1 = process.env.FINHUBKEYS.split(",")[0];
var finhub_api_key2 = process.env.FINHUBKEYS.split(",")[1];
var stgProduct_url = process.env.STAGEPRODUCTURL;
var authAccount = (""+process.env.AUTHACCOUNT).split(",");
var pjsConfigObj = JSON.parse(process.env.PJSPROXYCONFIG);
var bopisConfigObj = JSON.parse(process.env.BOPISPROXYCONFIG);
var spfWhitelist = (""+process.env.SPFCORS).split("\|");

var app = express();

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

//For client calls as server side can still pass through
var spfCorsOptions = {
  origin: function (origin, callback) {
  	console.log("Client Origin: " + origin);
  	//append || !origin condition to allow server to server tools access
    if (spfWhitelist.indexOf(origin) !== -1 || !origin) {
        callback(null, true);
    } else {
    	callback(new Error('Not allowed by Client CORS'));
    }
  }
};

// ---- To allow Global CORS -----
app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.setTimeout(240000, function(){
		console.log('Request has timed out.');
		res.status(200).send('{"error":"Request Timed-out"}');
	});
    next();
});
app.use(timeout('240s'));
app.use(express.urlencoded()); // For x-www-form-urlencoded request method
app.use(express.json());       // For json request method
app.use(express.text());       // For text/plain request method
app.use(haltOnTimedout);

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

// ---- MultiMath Instance ------
var configMM = JSON.parse(process.env.MMFIREBASECONFIG);
firebase.initializeApp(configMM, 'mmapp');
var databaseMM = firebase.app('mmapp').database();
var authMM = firebase.app('mmapp').auth();

// ---- Prefscription Instance ------
var configPS = JSON.parse(process.env.PSFIREBASECONFIG);
firebase.initializeApp(configPS, 'psapp');
var databasePS = firebase.app('psapp').database();
var authPS = firebase.app('psapp').auth();

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
 *  STOCKPORTFOLIO Endpoints
 ******************************/
app.post('/stockportfolio/quote', cors(spfCorsOptions), timeout('240s'), haltOnTimedout, function(req, res) {
	console.log("Server Origin: " + req.headers.origin);
    if(req.param('symbols') && req.param('fields') && spfWhitelist.indexOf(""+req.headers.origin) !== -1) {
    	var quoteDetails = new Array();
    	var symbolArr = req.param('symbols').split(",");
    	symbolArr.forEach(function(symbol) {
			var quoteData = new Object();
			rp("https://finnhub.io/api/v1/stock/profile2?symbol=" + symbol + "&token=" + finhub_api_key1).then(function(parsedBody) {
				if(parsedBody != null && parsedBody != "") {
					var parsedBodyObj = JSON.parse(parsedBody);
					quoteData.symbol = symbol;
					if(parsedBodyObj.name) {
						quoteData.refSymbol = parsedBodyObj.ticker;
						quoteData.shortName = parsedBodyObj.name;
						quoteData.currency = parsedBodyObj.currency;
						quoteData.exchange = parsedBodyObj.exchange;
						quoteData.segment = parsedBodyObj.finnhubIndustry;
						quoteData.ipoDate = parsedBodyObj.ipo;
						quoteData.logoImg = parsedBodyObj.logo;
						quoteData.chartImg = "https://stockcharts.com/c-sc/sc?s=" + quoteData.symbol + "&w=250&h=110&i=p67382559859";
					} else {
						quoteData.shortName = "NA";
					}
					return rp("https://finnhub.io/api/v1/quote?symbol=" + symbol + "&token=" + finhub_api_key1);
				}
			}).then(function(parsedBody2) {
				if(parsedBody2 != null && parsedBody2 != "") {
					var parsedBodyObj2 = JSON.parse(parsedBody2);
					if(parsedBodyObj2.c) {
						quoteData.regularMarketPrice = parsedBodyObj2.c;
						quoteData.regularMarketChange = parsedBodyObj2.d;
						quoteData.regularMarketChangePercent = parsedBodyObj2.dp;
						quoteData.time = parsedBodyObj2.t;
						quoteDetails.push(quoteData);
					} else {
						quoteDetails.push(quoteData);
					}
					if(quoteDetails.length == symbolArr.length) {
						var quoteResponse = new Object();
						quoteResponse.result = quoteDetails;
						var response = new Object();
						response.quoteResponse = quoteResponse;
						res.status(200).send(response);
					}
				}
			}).catch(function(err){
				console.log("Error fetching data: " + err);
				quoteData.symbol = symbol;
				quoteData.shortName = "NA";
				quoteDetails.push(quoteData);
				if(quoteDetails.length == symbolArr.length) {
					var quoteResponse = new Object();
					quoteResponse.result = quoteDetails;
					var response = new Object();
					response.quoteResponse = quoteResponse;
					res.status(200).send(response);
				}
			});		
    	});
    } else {
    	res.status(200).send('{"error":"Invalid Request"}');
    }
});
app.get('/stockportfolio/latestversion', cors(spfCorsOptions), timeout('240s'), haltOnTimedout, function(req, res) {
	var response = new Object();
	response.latestversion = process.env.SPFVER || "4.0.0";
	response.versionmemo = process.env.SPFMEMO || "<b>N/A</b>";
	res.status(200).send(response);
});


/*******************************
 *  STOCKMONITOR Endpoints
 ******************************/
app.post('/stockmonitor/quote', function(req, res) {
	if(req.param('symbols') && req.param('pkey')) {
    	var quoteDetails = new Array();
    	var symbolArr = req.param('symbols').split(",");
    	var fhApiKey = finhub_api_key1;
    	symbolArr.forEach(function(symbol) {
			var quoteData = new Object();
			rp("https://finnhub.io/api/v1/quote?symbol=" + symbol + "&token=" + fhApiKey).then(function(parsedBody2) {
				quoteData.symbol = symbol;
				if(parsedBody2 != null && parsedBody2 != "") {
					var parsedBodyObj2 = JSON.parse(parsedBody2);
					if(parsedBodyObj2.c) {
						quoteData.regMktPrice = parsedBodyObj2.c;
						quoteData.regMktChange = parsedBodyObj2.d;
						quoteData.regMktChangePercent = parsedBodyObj2.dp;
						quoteData.time = parsedBodyObj2.t;
						quoteDetails.push(quoteData);
					} else {
						quoteDetails.push(quoteData);
					}
				} else {
					quoteDetails.push(quoteData);
				}
				if(quoteDetails.length == symbolArr.length) {
					var quoteResponse = new Object();
					quoteResponse.result = quoteDetails;
					var response = new Object();
					response.quoteResponse = quoteResponse;
					res.status(200).send(response);
				}
			}).catch(function(err){
				console.log("Error fetching data: " + err);
				quoteData.symbol = symbol;
				quoteDetails.push(quoteData);
				fhApiKey = finhub_api_key2;
				if(quoteDetails.length == symbolArr.length) {
					var quoteResponse = new Object();
					quoteResponse.result = quoteDetails;
					var response = new Object();
					response.quoteResponse = quoteResponse;
					res.status(200).send(response);
				}
			});
    	});
    } else {
    	res.status(200).send('{"error":"Invalid Request"}');
    }
});

app.post('/stockmonitor/search', function(req, res) {
	if(req.param('query') && req.param('pkey')) {
    	var searchDetails = new Array();
		rp("https://s.yimg.com/xb/v6/finance/autocomplete?lang=en-US&query=" + req.param('query') + "&format=json").then(function(resBody) {
			if(resBody != null && resBody != "") {
				var resBodyObj = JSON.parse(resBody);
				if(resBodyObj.ResultSet && resBodyObj.ResultSet.Result) {
					for(var i=0; i<resBodyObj.ResultSet.Result.length; i++) {
						var rec = resBodyObj.ResultSet.Result[i];
						if(rec.type == "S") {
							var searchData = new Object();
							searchData.symbol = rec.symbol;
							searchData.name = rec.name;
							searchDetails.push(searchData);
						}
					}
				}
			}
			var searchResponse = new Object();
			searchResponse.results = searchDetails;
			var response = new Object();
			response.searchResponse = searchResponse;
			res.status(200).send(response);
		}).catch(function(err){
			console.log("Error fetching autocomplete search: " + err);			
			var searchResponse = new Object();
			searchResponse.results = searchDetails;
			var response = new Object();
			response.searchResponse = searchResponse;
			res.status(200).send(response);
		});
    } else {
    	res.status(200).send('{"error":"Invalid Request"}');
    }
});

app.post('/stockmonitor/news', function(req, res) {
	if(req.param('symbols') && req.param('limit') && req.param('pkey')) {
		var limit = 5;
		try {
			limit = parseInt(req.param('limit'));
			if(limit > 15) limit = 15;
		} catch(e) {limit = 5;}
    	var newsDetails = new Array();
		rp("https://feeds.finance.yahoo.com/rss/2.0/headline?s=" + req.param('symbols')).then(function(resBody) {
			if(resBody != null && resBody != "" && parser.validate(resBody) === true) {
				var jsonObj = parser.parse(resBody, {ignoreAttributes: false,attributeNamePrefix: "@_"});
				var items = [];
				if(jsonObj.rss && jsonObj.rss.channel) {
					items = jsonObj.rss.channel.item;
				}				
				if (!Array.isArray(items)) {
					items = [items];
				}
				newsDetails = items.map(function(item) {
					return {
						title: item.title,
						link: item.link,
						pubDate: item.pubDate,
						description: item.description
					};
				});
			}
			var newsResponse = new Object();
			newsResponse.results = newsDetails;
			var response = new Object();
			response.newsResponse = newsResponse;
			res.status(200).send(response);
		}).catch(function(err){
			console.log("Error fetching autocomplete search: " + err);			
			var newsResponse = new Object();
			newsResponse.results = newsDetails;
			var response = new Object();
			response.newsResponse = newsResponse;
			res.status(200).send(response);
		});
    } else {
    	res.status(200).send('{"error":"Invalid Request"}');
    }
});

/*******************************
 *  Staging Product Endpoint
 ******************************/
app.get('/stageproduct/:siteid/:productid', function(req, res) {
	if(stgProduct_url != "") {
		var dataURL = ""+stgProduct_url.replace("{0}", req.params.siteid).replace("{0}", req.params.siteid).replace("{1}", req.params.productid);
		rp(dataURL).then(function (data) {
			var parsedBody = JSON.parse(data);
			var response = new Object();
			if(parsedBody.hasOwnProperty("fault")) {
				console.log(parsedBody);
				response.status = "error";
			} else {
				response.status = "success";
				response.productName = parsedBody.name;
				var imgLink = "";
				for(var i=0; i<=parsedBody.image_groups.length; i++) {
					var data = parsedBody.image_groups[i];
					if (data.view_type == "hi-res") {
						imgLink = data.images[0].link;
						break;
					}
				}
				if(imgLink == "") {
					response.status = "error";
				} else {
					response.productImage = imgLink;
				}
			}
			res.status(200).send(response);
		}).catch(function (err) {
			console.log(err);
			res.status(200).send('{"status":"error"}');
		});
	} else {
		res.status(200).send('{"status":"error"}');
	}
});


/*******************************
 *     MULTIMATH Endpoints
 ******************************/
app.get('/multimath/:pkey', function(req, res) {
	var rootRef = databaseMM.ref();
	authMM.signInWithEmailAndPassword(authAccount[0], authAccount[1]).then(function(user) {
		var profRef = rootRef.child('Profiles');
		var recRef = profRef.child(req.params.pkey);
		recRef.once('value',function(snapshot) {
			if(snapshot != null && snapshot.val() != null) {
				var data = snapshot.val();
				if(data.enabled) {
					var retData = new Object();
					retData.balance = data.multiMoneyBalance;
					retData.displayName = data.dispName;
					res.status(200).send( JSON.stringify(retData) );
				} else {
					res.status(200).send('{"error":"Not Enabled"}');
				}
			} else {
				res.status(200).send('{"error":"Not Found"}');
			}
		});
	}).catch(function(error) {
		console.error("MM Auth Error: " + error.message);
		res.status(200).send('{"error":"Access Denied"}');
	});
});
app.post('/multimath/:pkey/submissions', function(req, res) {
    var profKey = req.params.pkey;
    
	authMM.signInWithEmailAndPassword(authAccount[0], authAccount[1]).then(function(user) {
		var rootRef = databaseMM.ref();
		var profileRef = rootRef.child('Profiles');
		var submissionRef = rootRef.child('Submissions');
		
		if(req.param('chapterNum') && req.param('chapterLevel') && req.param('data') && req.param('baseScore') && req.param('scoreRate') && req.param('finalScore') && req.param('targetTime') && req.param('actualTime')) {
			var newData = {
				"chapterNum" : Number(req.param('chapterNum')),
				"chapterLevel": Number(req.param('chapterLevel')),
				"data": req.param('data'),
				"targetTime": Number(req.param('targetTime')),
				"actualTime": Number(req.param('actualTime')),
				"baseScore": Number(req.param('baseScore')),
				"scoreRate": Number(req.param('scoreRate')),
				"finalScore": Number(req.param('finalScore')),
				"submitDateTime": (new Date()).getTime()
			};
			var recRef = profileRef.child(profKey);
			recRef.once('value',function(snapshot) {
				if(snapshot != null && snapshot.val() != null) {
					var data = snapshot.val();
					if(data.enabled) {
						var dataRef = submissionRef.child(profKey);
						dataRef.push(newData);
						data.multiMoneyBalance = data.multiMoneyBalance + Number(req.param('finalScore'));
						recRef.set(data);
						res.redirect('/multimath/'+profKey);
					} else {
						res.status(200).send('{"error":"Not Enabled"};');
					}
				} else {
					res.status(200).send('{"error":"Not Found"}');
				}
			});
		}
	}).catch(function(error) {
		console.error("MM Auth Error: " + error.message);
		res.status(200).send('{"error":"Access Denied"}');
	});
});


/*******************************
 *  PREFSCRIPTION Endpoints
 ******************************/
app.get('/prefscription/:pkey', function(req, res) {
	res.setHeader('Content-Type', 'application/json');
	var rootRef = databasePS.ref();
	authPS.signInWithEmailAndPassword(authAccount[0], authAccount[1]).then(function(user) {
		var profRef = rootRef.child('Profiles');
		var prefRef = rootRef.child('Preferences');
		var recRef = prefRef.child(req.params.pkey);
		recRef.once('value',function(snapshot) {
			if(snapshot != null && snapshot.val() != null) {
				var data = snapshot.val();
				if(data.accessCode != "N") {
					if(data.appCode == req.param('appCode')) {
						var usrRecRef = profRef.child(data.profileId);
						usrRecRef.once('value',function(pSnapshot) {
							if(pSnapshot != null && pSnapshot.val() != null) {
								 var usrData = pSnapshot.val();
								 if(usrData.enabled) {
								 	data.accessDateTime = (new Date()).getTime();
								 	recRef.set(data);
								 	var retData = new Object();
									retData.prefData = data.prefData;
									retData.planData = usrData.planData;
									retData.profName = usrData.name;
									res.status(200).send( JSON.stringify(retData) );
								 } else {
								 	res.status(200).send('{"error":"Profile Disabled"}');
								 }
							} else {
								res.status(200).send('{"error":"Invalid Profile"}');
							}
						});
					} else {
						res.status(200).send('{"error":"Incorrect AppCode"}');
					}
				} else {
					res.status(200).send('{"error":"No Access"}');
				}
			} else {
				res.status(200).send('{"error":"Not Found"}');
			}
		});
	}).catch(function(error) {
		console.error("PS Auth Error: " + error.message);
		res.status(200).send('{"error":"Access Denied"}');
	});
});
app.post('/prefscription/:pkey', function(req, res) {
	res.setHeader('Content-Type', 'application/json');
	var profKey = req.params.pkey;
    var rootRef = databasePS.ref();
	authPS.signInWithEmailAndPassword(authAccount[0], authAccount[1]).then(function(user) {
		var profRef = rootRef.child('Profiles');
		var prefRef = rootRef.child('Preferences');
		var recRef = prefRef.child(req.params.pkey);
		recRef.once('value',function(snapshot) {
			if(snapshot != null && snapshot.val() != null) {
				var data = snapshot.val();
				if(data.accessCode == "RW") {
					if(data.appCode == req.param('appCode')) {
						data.prefData = req.body;
						data.accessDateTime = (new Date()).getTime();
						var usrRecRef = profRef.child(data.profileId);
						usrRecRef.once('value',function(pSnapshot) {
							if(pSnapshot != null && pSnapshot.val() != null) {
								 var usrData = pSnapshot.val();
								 if(usrData.enabled) {
								 	recRef.set(data);
								 	res.status(200).send('{"success":"true"}');
								 } else {
								 	res.status(200).send('{"error":"Profile Disabled"}');
								 }
							} else {
								res.status(200).send('{"error":"Invalid Profile"}');
							}
						});
					} else {
						res.status(200).send('{"error":"Incorrect AppCode"}');
					}
				} else {
					res.status(200).send('{"error":"No Access"}');
				}
			} else {
				res.status(200).send('{"error":"Not Found"}');
			}
		});
	}).catch(function(error) {
		console.error("PS Auth Error: " + error.message);
		res.status(200).send('{"error":"Access Denied"}');
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
    var rootRef = databaseAL.ref();
	
	authAL.signInWithEmailAndPassword(authAccount[0], authAccount[1]).then(function(user) {
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

/***********************************
 *   Order Notes Proxy Endpoints
 **********************************/
app.post('/notesproxy/on/demandware.store/:sitename/default/COService-AddOrderNotes', function(req, res) {
	res.setHeader('Content-Type', 'application/json');
	if(req.header('data-client-id') != "poq" || req.header('data-auth-code') != "Mob!le21") {
		res.status(200).send('{"status": "unauthorized"}');
	} else {
		res.status(200).send('{"status": "success"}');
	}
});

/*******************************
 *     BOPIS Proxy Endpoints
 ******************************/
app.post('/bopisproxy/oauth/token', function(req, res) {
	res.setHeader('Content-Type', 'application/json');
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
		//if(req.params.username == "domadmin" && req.params.password == "password")
		res.status(200).send('{"access_token":"' + token + '","token_type":"bearer","refresh_token":"' + token + '","expires_in":86399,"scope":"read"}');
		//else
		//res.status(401).send('{"error":"unauthorized","error_description":"No AuthenticationProvider found for org.springframework.security.authentication.UsernamePasswordAuthenticationToken"}');
    }    
});
app.post('/bopisproxy/services/atc/availability/getAvailabilityList', function(req, res) {
	res.setHeader('Content-Type', 'application/json');
	try {
		var bodyData = req.body;
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
					var atc = 10; //Math.floor(Math.random() * 79);
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

app.post('/bopisproxy/inventory/api/availability/location/availabilitydetail', function(req, res) {
	res.setHeader('Content-Type', 'application/json');
	try {
		var bodyData = req.body;
		if(bopisConfigObj.authToken.mode == "simulated") {
			var items = bodyData.Items;
			var facilities = bodyData.Locations;
			var reqViewName = bodyData.ViewName;
			var responseBody = new Object();
			var availability = new Object();
			var availabilityDetails = new Object();
			var availabilityDetail = new Array();
			availability.success = true;
			availability.header = null;
			availability.messageKey = null;
			availability.message = null;
			availability.rootCause = null;
			availability.cloudComponent = "com-manh-cp-inventory:inventory,docker,omni,rest,cloud,kubernetes,gcp,rest-kubernetes,htpc,p,htpcp,htpcopr11o:8080";
			availability.cloudComponentHostName = "com-manh-cp-inventory-69994f7bdd-62lkk";
			availability.requestUri = null;
			availability.statusCode = "OK";
			
			for (var i=0; i<items.length; i++) {
				for (var j=0; j<facilities.length; j++) {
					var atc = 10;
					if(bopisConfigObj.alwaysInStock.indexOf(items[i]) > 0) {
						atc = 10;
					} else if(bopisConfigObj.alwaysOutOfStock.indexOf(items[i]) > 0) {
						atc = 0;
					} else {
						atc = Math.floor(Math.random() * 79);
					}
					var atcStatus = (atc > 0) ? "IN_STOCK" : "OUT_OF_STOCK";
					var availData = new Object();
					availData.ItemId = items[i];
					availData.LocationId = facilities[j];
					availData.Status = atcStatus;
					availData.StatusCode = 0;
					availData.Quantity = atc;
					availData.NextAvailabilityDate = null;
					availData.TransactionDateTime = null;
					availData.ViewName = reqViewName;
					availData.ViewId = reqViewName;
					availData.TotalIncludingSubstituteItems = atc;
					availData.SubstituteItemsAvailable = false;
					availData.SubstitutionDetails = null;
					availData.FirstAvailableFutureQuantity = null;
					availData.FirstAvailableFutureDate = null;
					availData.OnHandQuantity = null;
					availData.OnHandStatus = null;
					availData.OnHandStatusCode = null;
					availData.FutureQuantity =  null;
					availData.FutureSupplyDetails = null;
					availData.IsInfiniteAvailability = null;
					availabilityDetail.push(availData);
				}
			}
			availability.data = availabilityDetail;
			responseBody = availability;
			res.status(200).send(JSON.stringify(responseBody));
		}
	} catch(e) {
		res.status(401).send('{"success":true,"header":null,"data":[],"messageKey":null,"message":null,"errors":[],"exceptions":[],"messages":{"Message":[],"Size":0},"rootCause":null,"cloudComponent":"com-manh-cp-inventory:inventory,docker,omni,all,cloud,kubernetes,gcp,all-kubernetes,htpc,s,htpcs,htpcosf11o:8080","cloudComponentHostName":"all-com-manh-cp-inventory-6c9b5c5d4-j27pf","requestUri":null,"statusCode":"OK"}');
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
		} else if(req.param('app') == "multimath" && req.param('skey') == signup_key) {
			var rootRef = databaseMM.ref();
			authMM.signInWithEmailAndPassword(authAccount[0], authAccount[1]).then(function(user) {
				var profRef = rootRef.child('Profiles');
				var usersRef = profRef.push({
					dispName: req.param('user').charAt(0).toUpperCase() + req.param('user').substr(1),
					email: req.param('user')+"@email.com",
					multiMoneyBalance: 0,
					enabled: true
				});
				res.status(200).send('New Account Created for: ' + req.param('user').charAt(0).toUpperCase() + req.param('user').substr(1) + ' <br/>\nAccount Key: ' + usersRef.key);
			}).catch(function(error) {
				console.error("MM Auth Error: " + error.message);
				res.status(200).send('Error Processing');
			});
		} else if(req.param('app') == "prefscription" && req.param('skey') == signup_key) {
			if(req.param('user').indexOf("@") > 0 && req.param('prefappcode').trim() != "") {
				var rootRef = databasePS.ref();
				authPS.signInWithEmailAndPassword(authAccount[0], authAccount[1]).then(function(user) {
					var profRef = rootRef.child('Profiles');
					var query = profRef.orderByKey();
					query.once('value',function(snapshot) {
						var profId = "";
						var newProf = true;
						snapshot.forEach(function (childSnap) {
							var prof = childSnap.val();
							if(profId == "" && prof.email == req.param('user')) {
								profId = childSnap.key;
								newProf = false;
								return true;
							}
						});
						if(profId == "") {
							var usersRef = profRef.push({
								createdOn : (new Date()).getTime(),
								name: req.param('user').charAt(0).toUpperCase() + req.param('user').substring(1, req.param('user').indexOf("@")),
								email: req.param('user'),
								enabled: true,
								planData: "standard",
								settings: ""
							});
							profId = usersRef.key;
						}
						if(profId != "") {
							var prefRef = rootRef.child('Preferences');
							var dataRef = prefRef.push({
								profileId: profId,
								appCode: req.param('prefappcode').toUpperCase(),
								accessCode: "RW",
								prefData: new Buffer("{}", "utf8").toString('base64'),
								accessDateTime : (new Date()).getTime()
							});
							res.status(200).send('New Pref-Key Generated for: ' + req.param('user') + ' <br/>\nNew Profile: ' + newProf + '<br/>\Pref Key: ' + dataRef.key);
						} else {
							res.status(200).send('Error Processing');
						}
					});
				}).catch(function(error) {
					console.error("PS Auth Error: " + error.message);
					res.status(200).send('Error Processing');
				});
			} else {
				res.status(200).send('Invalid user format or missing prefappcode for this app');
			}
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


function haltOnTimedout (req, res, next) {
  if (!req.timedout) next();
}

/*******************************
 *     Startup App
 ******************************/
app.listen(server_port, function () {
    console.log( "Listening to " + server_port  );
});
