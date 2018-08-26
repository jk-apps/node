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

app.get('/add/:addflag', function(req, res) {
    var rootRef = database.ref();
    var ownerRef = rootRef.child('Owners');
    var clipRef = rootRef.child('Clips');
    var usersRef = ownerRef.push({
        username: req.params.addflag.charAt(0).toUpperCase() + req.params.addflag.substr(1),
        email: req.params.addflag+"@email.com",
        enabled: true,
        quota: 20
    });
    clipRef.child(usersRef.key).set({});
    res.status(200).send('<b>' + req.params.addflag.charAt(0).toUpperCase() + req.params.addflag.substr(1) + '</b><br/>Account Key: <b>' + usersRef.key + '</b>');
});
app.listen(3000);

console.log('App started and listening to http://localhost:3000/add/<username>');