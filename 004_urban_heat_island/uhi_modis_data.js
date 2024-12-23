// STEP 1: AOI and Modis data
var aoi =
    /* color: #d63000 */
    /* shown: false */
    /* displayProperties: [
      {
        "type": "rectangle"
      }
    ] */
    ee.Geometry.Polygon(
      [
        [
          [85.22455023570537, 27.80807985157256],
          [85.22455023570537, 27.598951434069242],
          [85.46624945445537, 27.598951434069242],
          [85.46624945445537, 27.80807985157256],
        ],
      ],
      null,
      false
    ),
  modis = ee.ImageCollection("MODIS/061/MYD11A2");

// Set center and visualize AOI
Map.centerObject(aoi, 10);
Map.addLayer(aoi, {}, "AOI", false);

// STEP 2: Select summer months and filter required band
var modisLst = modis.select("LST_Day_1km");
var summerFilter = ee.Filter.dayOfYear(152, 243);

var year = 2020;
var filterModis = modisLst
  .filterDate(year + "-01-01", year + "-12-30")
  .filter(summerFilter);

// STEP 3: Compute mean temperature on year
var meanTemp = filterModis.mean().multiply(0.02).subtract(273.15).clip(aoi);

Map.addLayer(meanTemp, { palette: ["blue", "white", "red"], min: 25, max: 38 });

// STEP 4: Loop over all the analysis years to get mean temperature
var yearlySummerLST = ee.List.sequence(2003, 2024).map(function (year) {
  year = ee.Number(year);
  var filtered = modisLst
    .filter(ee.Filter.calendarRange(year, year, "year"))
    .filter(summerFilter);

  // Check if the collection is not empty
  var meanLST = ee.Algorithms.If(
    filtered.size().gt(0),
    filtered.mean().multiply(0.02).subtract(273.15), // Scale and convert to Celsius
    null // Assign null for empty years
  );

  return ee.Feature(null, {
    year: year,
    meanTemp: ee.Algorithms.If(
      meanLST, // Only process non-null cases
      ee
        .Image(meanLST)
        .reduceRegion({
          reducer: ee.Reducer.mean(),
          geometry: aoi,
          scale: 1000,
          maxPixels: 1e13,
        })
        .get("LST_Day_1km"),
      null
    ),
  });
});

// Create a feature collection of yearly mean temperatures
var yearlyFeatures = ee.FeatureCollection(yearlySummerLST);

print(yearlyFeatures, "yearlyFeatures");

// STEP 5: Generate graph
// Create a chart for visualization
// var chart = ui.Chart.feature.byFeature(yearlyFeatures, 'year', 'meanTemp')
//   .setChartType('LineChart')
//   .setOptions({
//     title: 'Mean Yearly Summer Surface Temperature (2003-2024)',
//     hAxis: { title: 'Year' },
//     vAxis: { title: 'Temperature (°C)' },
//     lineWidth: 2,
//     pointSize: 4
//   });

// print(chart);

// STEP 6: Regration analysis
var yearlyFeatures = ee.FeatureCollection(yearlySummerLST);

// Filter valid data
var validFeatures = yearlyFeatures.filter(ee.Filter.notNull(["meanTemp"]));

// Perform linear regression
var regression = validFeatures.reduceColumns({
  reducer: ee.Reducer.linearFit(),
  selectors: ["year", "meanTemp"],
});

// Extract regression coefficients
var slope = ee.Number(regression.get("scale"));
var intercept = ee.Number(regression.get("offset"));

// Print regression coefficients
print("Regression Slope:", slope);
print("Regression Intercept:", intercept);

// Add a regression line to the chart
var trendLine = ee.FeatureCollection(
  ee.List.sequence(2003, 2024).map(function (x) {
    x = ee.Number(x);
    return ee.Feature(null, {
      year: x,
      meanTemp: slope.multiply(x).add(intercept),
    });
  })
);

// Add a 'type' property to distinguish data points and regression line
var dataPoints = validFeatures.map(function (feature) {
  return feature.set("type", "data");
});

var regressionLine = trendLine.map(function (feature) {
  return feature.set("type", "trend");
});

// Merge both collections
var combinedFeatures = dataPoints.merge(regressionLine);

// Create a chart with grouped features
var chart = ui.Chart.feature
  .groups({
    features: combinedFeatures,
    xProperty: "year",
    yProperty: "meanTemp",
    seriesProperty: "type",
  })
  .setChartType("LineChart")
  .setOptions({
    title: "Mean Yearly Summer Surface Temperature (2000-2024)",
    hAxis: { title: "Year" },
    vAxis: { title: "Temperature (°C)" },
    series: {
      1: {
        color: "red", // Data points color
        lineWidth: 2, // Line thickness for data
        pointSize: 0, // Vertices size for data
      },
      0: {
        color: "blue", // Trend line color
        lineWidth: 2, // Line thickness for the trend line
        pointSize: 5, // No vertices for the trend line
      },
    },
  });

// Print the chart
print(chart);

//Ref
//https://google-earth-engine.com/Human-Applications/Heat-Islands/
