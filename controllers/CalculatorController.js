const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

exports.getAllRoiResults = async (req, res) => {
  try {
    const results = await prisma.roiResult.findMany({
      include: {
        financialDetails: true,
        businessStrategy: {
          include: {
            equipments: {
              include: { equipment: true },
            },
          },
        },
      },
    });

    res.status(200).json({
      message: "Daftar hasil ROI berhasil diambil!",
      count: results.length,
      data: results,
    });
  } catch (error) {
    console.error("Error fetching ROI results: ", error);
    res.status(500).json({ message: "Gagal mengambil data ROI" });
  }
};

exports.calculateRoi = async (req, res) => {
  try {
    const { financial_details, business_strategy, equipments } = req.body;

    console.log("Received payload:", req.body);

    // Validasi input
    if (!financial_details) {
      return res
        .status(400)
        .json({ message: "Data financial_details diperlukan" });
    }

    // Ambil data keuangan
    const {
      initial_investment,
      expected_monthly_revenue,
      monthly_operating_cost,
      timeframe,
    } = financial_details;

    // Validasi data required
    if (
      !initial_investment ||
      !expected_monthly_revenue ||
      !monthly_operating_cost ||
      !timeframe
    ) {
      return res.status(400).json({
        message:
          "Semua data keuangan diperlukan: initial_investment, expected_monthly_revenue, monthly_operating_cost, timeframe",
      });
    }

    // Konversi ke number
    const initInvest = parseInt(initial_investment);
    const monthlyRev = parseInt(expected_monthly_revenue);
    const monthlyCost = parseInt(monthly_operating_cost);
    const timeFrame = parseInt(timeframe);

    // **ENHANCED: Generate dynamic monthly data**
    const monthlyData = generateDynamicMonthlyData({
      initial_investment: initInvest,
      expected_monthly_revenue: monthlyRev,
      monthly_operating_cost: monthlyCost,
      timeframe: timeFrame,
      business_model: business_strategy?.business_model,
    });

    // Hitung totals dari dynamic data
    const total_revenue = monthlyData.reduce(
      (sum, month) => sum + month.revenue,
      0
    );
    const total_operating_cost = monthlyData.reduce(
      (sum, month) => sum + month.cost,
      0
    );
    const net_profit = total_revenue - total_operating_cost;
    const roi_percentage = (net_profit / initInvest) * 100;

    // Hitung payback period yang lebih akurat
    const payback_period_years = calculateDynamicPaybackPeriod(
      monthlyData,
      initInvest
    );

    console.log("Enhanced calculation results:", {
      total_revenue,
      total_operating_cost,
      net_profit,
      roi_percentage,
      payback_period_years,
      monthly_data_points: monthlyData.length,
    });

    // **PERBAIKAN: Simpan tanpa monthly_data (gunakan schema existing)**
    const newFinancial = await prisma.financialDetails.create({
      data: {
        initial_investment: initInvest,
        expected_monthly_revenue: monthlyRev,
        monthly_operating_cost: monthlyCost,
        timeframe: timeFrame,
        // HAPUS: monthly_data - tidak ada di schema
      },
    });

    // Handle business strategy
    let fundingOptionValue = null;
    let businessModelValue = null;

    if (business_strategy) {
      fundingOptionValue =
        typeof business_strategy.funding_option === "object"
          ? business_strategy.funding_option.label
          : business_strategy.funding_option;

      businessModelValue =
        typeof business_strategy.business_model === "object"
          ? business_strategy.business_model.label
          : business_strategy.business_model;
    }

    const newStrategy = await prisma.businessStrategy.create({
      data: {
        strategy_name: "Custom Strategy",
        funding_option: fundingOptionValue,
        business_model: businessModelValue,
      },
    });

    // Hubungkan Equipments
    if (equipments && Array.isArray(equipments) && equipments.length > 0) {
      const validEquipmentIds = equipments.filter(
        (id) => Number.isInteger(id) && id > 0
      );

      for (const equipmentId of validEquipmentIds) {
        await prisma.businessStrategyEquipment.create({
          data: {
            businessStrategyId: newStrategy.id,
            equipmentId: equipmentId,
          },
        });
      }
    }

    // Simpan hasil ROI
    const newResult = await prisma.roiResult.create({
      data: {
        roi_percentage: parseFloat(roi_percentage.toFixed(2)),
        net_profit: parseInt(net_profit),
        payback_period_years: parseFloat(payback_period_years.toFixed(2)),
        total_revenue: parseInt(total_revenue),
        total_operating_cost: parseInt(total_operating_cost),
        financialDetailsId: newFinancial.id,
        businessStrategyId: newStrategy.id,
      },
    });

    // Ambil data lengkap
    const resultWithRelations = await prisma.roiResult.findUnique({
      where: { id: newResult.id },
      include: {
        financialDetails: true,
        businessStrategy: {
          include: {
            equipments: {
              include: { equipment: true },
            },
          },
        },
      },
    });

    // **ENHANCED: Return response dengan chart data (tanpa simpan ke database)**
    res.status(201).json({
      message: "Perhitungan ROI berhasil!",
      data: {
        ...resultWithRelations,
        // Tambahkan chart data dalam response (hanya di response, tidak di database)
        chartData: {
          revenueCost: generateRevenueCostChartData(monthlyData),
          roiGrowth: generateRoiGrowthChartData(
            monthlyData,
            roi_percentage,
            initInvest
          ),
          performanceMetrics: generatePerformanceMetrics(resultWithRelations),
          monthlyData: monthlyData, // Kirim raw monthly data juga
        },
      },
    });
  } catch (error) {
    console.error("Error calculating ROI: ", error);
    res.status(500).json({
      message: "Terjadi kesalahan saat menghitung ROI",
      error: error.message,
    });
  }
};

// Helper functions (tetap sama seperti sebelumnya)
const generateDynamicMonthlyData = ({
  initial_investment,
  expected_monthly_revenue,
  monthly_operating_cost,
  timeframe,
  business_model,
}) => {
  const monthlyData = [];
  let currentRevenue = expected_monthly_revenue * 0.6; // Start at 60% capacity
  let currentCost = monthly_operating_cost;

  // Growth factors berdasarkan business model
  const growthFactors = getGrowthFactors(business_model);

  for (let month = 1; month <= timeframe; month++) {
    // Apply growth to revenue (gradual increase)
    if (month > 1) {
      const growthRate =
        growthFactors.monthlyGrowth * (1 + (Math.random() * 0.1 - 0.05)); // ±5% variance
      currentRevenue = Math.min(
        currentRevenue * (1 + growthRate),
        expected_monthly_revenue * growthFactors.maxCapacity
      );
    }

    // Cost fluctuations (realistic variations)
    const costVariation = 1 + (Math.random() * 0.1 - 0.05); // ±5% cost variation
    currentCost = monthly_operating_cost * costVariation;

    // Seasonal effects
    const seasonalMultiplier = getSeasonalMultiplier(month);
    const adjustedRevenue = currentRevenue * seasonalMultiplier;

    const profit = adjustedRevenue - currentCost;
    const cumulativeProfit =
      monthlyData.length > 0
        ? monthlyData[monthlyData.length - 1].cumulativeProfit + profit
        : profit - initial_investment;

    monthlyData.push({
      month,
      revenue: Math.round(adjustedRevenue),
      cost: Math.round(currentCost),
      profit: Math.round(profit),
      cumulativeProfit: Math.round(cumulativeProfit),
      revenueGrowth: Math.round(
        ((adjustedRevenue -
          (monthlyData[month - 2]?.revenue || adjustedRevenue)) /
          (monthlyData[month - 2]?.revenue || adjustedRevenue)) *
          100
      ),
      capacityUtilization: Math.round(
        (adjustedRevenue / expected_monthly_revenue) * 100
      ),
    });
  }

  return monthlyData;
};

const getGrowthFactors = (business_model) => {
  const factors = {
    "B2B Manufacturing": { monthlyGrowth: 0.08, maxCapacity: 1.2 },
    "Penjualan Langsung (B2C)": { monthlyGrowth: 0.12, maxCapacity: 1.5 },
    "Layanan Berlangganan": { monthlyGrowth: 0.05, maxCapacity: 1.1 },
    "Waralaba (Franchise)": { monthlyGrowth: 0.06, maxCapacity: 1.3 },
    "Produksi (B2B)": { monthlyGrowth: 0.07, maxCapacity: 1.15 },
  };

  return factors[business_model] || { monthlyGrowth: 0.08, maxCapacity: 1.2 };
};

const getSeasonalMultiplier = (month) => {
  const seasonalPatterns = {
    1: 0.9,
    2: 0.95,
    3: 1.0,
    4: 1.0,
    5: 1.05,
    6: 1.1,
    7: 1.15,
    8: 1.1,
    9: 1.05,
    10: 1.0,
    11: 0.95,
    12: 0.9,
  };

  return seasonalPatterns[((month - 1) % 12) + 1] || 1.0;
};

const calculateDynamicPaybackPeriod = (monthlyData, initialInvestment) => {
  for (let i = 0; i < monthlyData.length; i++) {
    if (monthlyData[i].cumulativeProfit >= 0) {
      return (i + 1) / 12;
    }
  }
  return monthlyData.length / 12;
};

const generateRevenueCostChartData = (monthlyData) => {
  // Sample data points untuk avoid terlalu banyak data di chart
  const sampleRate = Math.ceil(monthlyData.length / 24);
  const sampledData = monthlyData.filter(
    (_, index) => index % sampleRate === 0
  );

  return {
    labels: sampledData.map((item) => `Month ${item.month}`),
    datasets: [
      {
        label: "Revenue",
        data: sampledData.map((item) => item.revenue),
        borderColor: "#8884d8",
        backgroundColor: "#8884d8",
        type: "line",
        tension: 0.4,
      },
      {
        label: "Cost",
        data: sampledData.map((item) => item.cost),
        borderColor: "#82ca9d",
        backgroundColor: "#82ca9d",
        type: "line",
        tension: 0.4,
      },
      {
        label: "Profit",
        data: sampledData.map((item) => item.profit),
        borderColor: "#ffc658",
        backgroundColor: "#ffc658",
        type: "bar",
      },
    ],
  };
};

const generateRoiGrowthChartData = (
  monthlyData,
  finalROI,
  initialInvestment
) => {
  const roiData = monthlyData.map((item) => ({
    month: item.month,
    roi:
      ((item.cumulativeProfit + initialInvestment) / initialInvestment) * 100,
  }));

  const sampleRate = Math.ceil(roiData.length / 12);
  const sampledROIData = roiData.filter((_, index) => index % sampleRate === 0);

  return {
    labels: sampledROIData.map((item) => `Month ${item.month}`),
    datasets: [
      {
        label: "ROI Progress",
        data: sampledROIData.map((item) => Math.min(item.roi, finalROI)),
        borderColor: "#ff7300",
        backgroundColor: "rgba(255, 115, 0, 0.1)",
        fill: true,
        tension: 0.4,
      },
      {
        label: "Target ROI",
        data: sampledROIData.map(() => finalROI),
        borderColor: "#000000",
        borderDash: [5, 5],
        borderWidth: 1,
        fill: false,
      },
    ],
  };
};

const generatePerformanceMetrics = (roiResult) => {
  const { financialDetails, roi_percentage, net_profit, payback_period_years } =
    roiResult;

  return {
    summary: {
      roi: roi_percentage,
      netProfit: net_profit,
      paybackPeriod: payback_period_years,
      totalMonths: financialDetails.timeframe,
    },
    averages: {
      monthlyRevenue: financialDetails.expected_monthly_revenue,
      monthlyCost: financialDetails.monthly_operating_cost,
      monthlyProfit:
        financialDetails.expected_monthly_revenue -
        financialDetails.monthly_operating_cost,
    },
    efficiency: {
      profitMargin:
        (net_profit /
          (financialDetails.expected_monthly_revenue *
            financialDetails.timeframe)) *
          100 || 0,
      investmentEfficiency:
        (net_profit / financialDetails.initial_investment) * 100,
    },
  };
};
