var aoi =
    /* color: #d63000 */
    /* shown: false */
    ee.FeatureCollection([
      ee.Feature(
        ee.Geometry.Polygon([
          [
            [55.034117677488815, 25.065930053437267],
            [55.108275392332565, 25.00745019271374],
            [55.176253297606, 24.995004073640924],
            [55.23805139330913, 25.02985002897115],
            [55.337945268015034, 25.157601974449687],
            [55.399056718210346, 25.230297144591212],
            [55.453988358835346, 25.285566097838725],
            [55.36472444281972, 25.33025964182961],
            [55.275460526804096, 25.308535672627915],
            [55.112725541452534, 25.139576806756818],
            [55.066033646921284, 25.102896699772277],
          ],
        ]),
        {
          "system:index": "0",
        }
      ),
    ]),
  s2 = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
function maskS2clouds(image) {
  var qa = image.select("QA60");

  // Bits 10 and 11 are clouds and cirrus, respectively.
  var cloudBitMask = 1 << 10;
  var cirrusBitMask = 1 << 11;

  // Both flags should be set to zero, indicating clear conditions.
  var mask = qa
    .bitwiseAnd(cloudBitMask)
    .eq(0)
    .and(qa.bitwiseAnd(cirrusBitMask).eq(0));

  return image.updateMask(mask);
}

//filter dataset based on the time, cloud cover and aoi
var dataset = s2
  .filterDate("2024-04-16", "2024-04-30")
  .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 50))
  .filterBounds(aoi)
  .map(function (img) {
    return img.clip(aoi);
  });
// .map(maskS2clouds)
Map.addLayer(aoi, {}, "aoi", false);

// var dataset = landsat8
//                   .filterDate('2018-11-01', '2018-12-30')
//                   .filter(ee.Filter.lt('CLOUD_COVER',5))
//                   .filterBounds(aoi)
//                   .map(function(img) {return img.clip(aoi)})

// extract the required bands
var required_bands = ["B11", "B8", "B4", "B3", "B2"];
dataset = dataset.median().select(required_bands);

var mndwi = dataset
  .expression("(Green - SWIR1) / (Green + SWIR1)", {
    Green: dataset.select("B3"),
    SWIR1: dataset.select("B11"),
  })
  .rename("mndwi");

var threshold = 0;
var water = mndwi.where(mndwi.gte(0), 1).where(mndwi.lt(0), 0);
Map.addLayer(dataset, {}, "dataset true color");
Map.addLayer(mndwi, {}, "mndwi");
Map.addLayer(water, {}, "ls_water_after");

print(dataset);

Map.centerObject(aoi, 12);

// Map.addLayer(dataset, trueColor321Vis, 'dataset');

// Export the image
Export.image.toDrive({
  image: dataset,
  description: "landsat",
  region: aoi,
  scale: 30,
});
