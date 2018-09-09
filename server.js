var express = require('express');
var firebaseTB = require('firebase');

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
    apiKey: "AIzaSyBLQPgC2j9okz3zU9ms2oe0foW6kXMvDj8",
    authDomain: "textbin-9ca75.firebaseapp.com",
    databaseURL: "https://textbin-9ca75.firebaseio.com",
    storageBucket: "textbin-9ca75.appspot.com"
};
firebaseTB.initializeApp(configTB);
var databaseTB = firebaseTB.app().database();

/*******************************
 *     TextBin Endpoints
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
 *     Global Endpoints
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
			res.status(200).send('New Account Created for: ' + req.param('user').charAt(0).toUpperCase() + req.param('user').substr(1) + '\nAccount Key: ' + usersRef.key);
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