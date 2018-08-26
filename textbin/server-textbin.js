var express = require('express');
var firebase = require('firebase');

var app = express();

var config = {
    apiKey: "AIzaSyBLQPgC2j9okz3zU9ms2oe0foW6kXMvDj8",
    authDomain: "textbin-9ca75.firebaseapp.com",
    databaseURL: "https://textbin-9ca75.firebaseio.com",
    storageBucket: "textbin-9ca75.appspot.com"
};
firebase.initializeApp(config);

// Get a reference to the database service
var database = firebase.app().database();

// To allow CORS
app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});
app.use(express.urlencoded());  // for parsing application/x-www-form-urlencoded
app.use(express.json());        // for parsing application/json

app.get('/:ownkey', function(req, res) {
    var ownkey = req.params.ownkey;
    var rootRef = database.ref();
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

app.post('/:ownkey', function(req, res) {
    var ownkey = req.params.ownkey;
    var rootRef = database.ref();
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
                    res.redirect('/'+ownkey);
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
        res.redirect('/'+ownkey);
    }
});

app.listen(3000);