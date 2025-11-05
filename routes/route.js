const express = require("express");
const {
  getAllRoiResults,
  calculateRoi,
} = require("../controllers/CalculatorController");

const router = express.Router();

router.get("/api/roi-results", getAllRoiResults);
router.post("/api/calculate-roi", calculateRoi);

module.exports = router;
