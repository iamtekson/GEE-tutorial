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
          [35.8470699180979, 29.137239091203085],
          [35.8470699180979, 28.207074712625143],
          [37.2148677696604, 28.207074712625143],
          [37.2148677696604, 29.137239091203085],
        ],
      ],
      null,
      false
    ),
  landsat5 = ee.ImageCollection("LANDSAT/LT05/C02/T1_L2"),
  landsat8 = ee.ImageCollection("LANDSAT/LC08/C02/T1_L2"),
  landsat7 = ee.ImageCollection("LANDSAT/LE07/C02/T1_L2"),
  landsat4 = ee.ImageCollection("LANDSAT/LT04/C02/T1_L2"),
  landsat9 = ee.ImageCollection("LANDSAT/LC09/C02/T1_L2");

// Generate dynamic year list from 1984 to the current year
var startYear = 1984;
var currentYear = ee.Date(Date.now()).get("year").getInfo();
var yearList = ee.List.sequence(startYear, currentYear);

// Function to filter
function filterCol(col, aoi, date) {
  return col.filterDate(date[0], date[1]).filterBounds(aoi);
}

// Center map to region of interest
Map.centerObject(aoi, 10);

// Composite function
function landsat457(aoi, date) {
  var col = filterCol(landsat4, aoi, date)
    .merge(filterCol(landsat5, aoi, date))
    .merge(filterCol(landsat7, aoi, date));
  var image = col.map(cloudMaskTm).median().clip(aoi);
  return image;
}

function landsat89(aoi, date) {
  var col = filterCol(landsat8, aoi, date).merge(
    filterCol(landsat9, aoi, date)
  );
  var image = col.map(cloudMaskOli).median().clip(aoi);
  return image;
}

// Cloud mask
function cloudMaskTm(image) {
  var qa = image.select("QA_PIXEL");
  var dilated = 1 << 1;
  var cloud = 1 << 3;
  var shadow = 1 << 4;
  var mask = qa
    .bitwiseAnd(dilated)
    .eq(0)
    .and(qa.bitwiseAnd(cloud).eq(0))
    .and(qa.bitwiseAnd(shadow).eq(0));

  return image
    .select(
      ["SR_B1", "SR_B2", "SR_B3", "SR_B4", "SR_B5", "SR_B7"],
      ["B2", "B3", "B4", "B5", "B6", "B7"]
    )
    .updateMask(mask);
}

function cloudMaskOli(image) {
  var qa = image.select("QA_PIXEL");
  var dilated = 1 << 1;
  var cirrus = 1 << 2;
  var cloud = 1 << 3;
  var shadow = 1 << 4;
  var mask = qa
    .bitwiseAnd(dilated)
    .eq(0)
    .and(qa.bitwiseAnd(cirrus).eq(0))
    .and(qa.bitwiseAnd(cloud).eq(0))
    .and(qa.bitwiseAnd(shadow).eq(0));

  return image
    .select(
      ["SR_B2", "SR_B3", "SR_B4", "SR_B5", "SR_B6", "SR_B7"],
      ["B2", "B3", "B4", "B5", "B6", "B7"]
    )
    .updateMask(mask);
}

// Calculate vegetated area for each year
var vegetatedAreaFeatureCollection = ee.FeatureCollection(
  yearList.map(function (year) {
    year = ee.Number(year);

    // Use ee.Algorithms.If to check the year condition
    var image = ee.Algorithms.If(
      year.lt(2014),
      landsat457(aoi, [
        ee.Date.fromYMD(year, 8, 1),
        ee.Date.fromYMD(year, 12, 31),
      ]),
      landsat89(aoi, [
        ee.Date.fromYMD(year, 8, 1),
        ee.Date.fromYMD(year, 12, 31),
      ])
    );

    // Ensure the image is a valid ee.Image
    image = ee.Image(image); // Ensure it's an image
    var hasBands = image.bandNames().size().gt(0);

    return ee.Algorithms.If(
      hasBands,
      // If the image has bands, calculate vegetated area
      (function () {
        var ndvi = image
          .expression("(NIR - RED) / (NIR + RED)", {
            NIR: image.select("B5"),
            RED: image.select("B4"),
          })
          .rename("NDVI");

        // Threshold NDVI (>0.2 for vegetation)
        var binaryVegetation = ndvi.gt(0.2).rename("Vegetation");

        // Calculate area of vegetated regions
        var pixelArea = binaryVegetation.multiply(ee.Image.pixelArea());
        var area = pixelArea
          .reduceRegion({
            reducer: ee.Reducer.sum(),
            geometry: aoi,
            scale: 30,
            maxPixels: 1e10,
          })
          .get("Vegetation");

        // Convert area to square kilometers
        var areaKm2 = ee.Number(area).divide(1e6);

        return ee.Feature(null, { year: year, area: areaKm2 });
      })(),
      // If no image found, return zero area
      ee.Feature(null, { year: year, area: 0 })
    );
  })
);

// Remove zero-area features
var filteredFeatureCollection = vegetatedAreaFeatureCollection.filter(
  ee.Filter.gt("area", 0)
);

// Chart the results
var chart = ui.Chart.feature
  .byFeature(filteredFeatureCollection, "year", "area")
  .setOptions({
    title: "Vegetated Area Over Years",
    hAxis: { title: "Year" },
    vAxis: { title: "Vegetated Area (km²)" },
    lineWidth: 2,
    pointSize: 4,
  });

print(chart);
