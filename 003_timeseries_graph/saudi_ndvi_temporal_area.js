// Step 1: Create AOI and import landsat imagery
var aoi =
    /* color: #d63000 */
    /* shown: false */
    ee.Geometry.Polygon([
      [
        [36.13919347951815, 28.71435800166699],
        [36.01834387014315, 28.55042991056677],
        [36.21609777639315, 28.420069602828118],
        [36.49075597951815, 28.32823821009383],
        [36.74893469045565, 28.202445544634088],
        [37.10049719045565, 28.270198509014413],
        [37.13894933889315, 28.521474865562446],
        [36.69949621389315, 28.516648251260627],
        [36.54568762014315, 28.545604622330284],
        [36.47976965139315, 28.666170444358645],
        [36.36441320608065, 28.954962448250285],
        [36.28381536419197, 29.113538433097446],
        [35.94873235637947, 29.060734323847715],
        [36.00915716106697, 28.839624347774905],
      ],
    ]),
  landsat4 = ee.ImageCollection("LANDSAT/LT04/C02/T1_L2"),
  landsat5 = ee.ImageCollection("LANDSAT/LT05/C02/T1_L2"),
  landsat7 = ee.ImageCollection("LANDSAT/LE07/C02/T1_L2"),
  landsat8 = ee.ImageCollection("LANDSAT/LC08/C02/T1_L2"),
  landsat9 = ee.ImageCollection("LANDSAT/LC09/C02/T1_L2");

// Step 2: Generate dynamic year list from 1982 to the current year
var startYear = 1984;
var currentYear = 2024;
var yearList = ee.List.sequence(startYear, currentYear);

print(yearList);

// center my map to aoi and zoom it in zoom level 10
Map.centerObject(aoi, 10);

// Step 3: Filter Imageries based on date, bounds and take clip to aoi
function filterCol(col, aoi, date) {
  return col.filterDate(date[0], date[1]).filterBounds(aoi);
}

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

// Step 4: Remove cloudy pixels (bitwise mask)
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
// Step 5: Compute NDVI, threshold by 0.2 and visualize
var year = 2020;
var image = landsat89(aoi, [year + "-08-01", year + "-12-30"]);
Map.addLayer(image, {}, "Landsat_" + year);

var ndvi = image
  .expression("(NIR - RED) / (NIR + RED)", {
    NIR: image.select("B5"),
    RED: image.select("B4"),
  })
  .rename("NDVI");

Map.addLayer(
  ndvi,
  { min: -1, max: 1, palette: ["blue", "white", "green"] },
  "NDVI_" + year
);

var binaryVegetation = ndvi.gt(0.2).rename("Vegetation");
Map.addLayer(binaryVegetation, {}, "binaryVegetation_" + year);

// Step 6: Calculate Area
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

print("Vegetation Area in 2020 (KM2): ", areaKm2);

// Step 7: Write a loop to compute NDVI and calculate area for all years
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

// Step 8: Generate chart
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
