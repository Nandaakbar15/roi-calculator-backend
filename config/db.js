var mysql = require("mysql");

var hostname = "dwchfx.h.filess.io";
var database = "roi-calculator-db_barnsickme";
var port = "3306";
var username = "roi-calculator-db_barnsickme";
var password = "40a067746860766aa2b109cd01072e93dd82ed15";

var con = mysql.createConnection({
  host: hostname,
  user: username,
  password,
  database,
  port,
});

con.connect(function (err) {
  if (err) throw err;
  console.log("Connected!");
});

con.query("SELECT 1+1").on("result", function (row) {
  console.log(row);
});
