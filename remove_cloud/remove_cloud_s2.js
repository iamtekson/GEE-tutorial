/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var s2 = ee.ImageCollection("COPERNICUS/S2_HARMONIZED"),
  rgb_vis = {
    opacity: 1,
    bands: ["B4", "B3", "B2"],
    min: 392.63,
    max: 1694.87,
    gamma: 1,
  },
  aoi =
    /* color: #98ff00 */
    /* shown: false */
    /* displayProperties: [
      {
        "type": "rectangle"
      }
    ] */
    ee.Geometry.Polygon(
      [
        [
          [83.81818134091355, 28.310008820813],
          [83.81818134091355, 28.048536685843512],
          [84.23703510067918, 28.048536685843512],
          [84.23703510067918, 28.310008820813],
        ],
      ],
      null,
      false
    );
/***** End of imports. If edited, may not auto-convert in the playground. *****/
// function to mask the cloud in sentinel2 dataset
function maskS2clouds(image) {
  var qa = image.select("QA60");

  var cloudBitMask = 1 << 10;
  var cirrusBitMask = 1 << 11;

  var mask = qa
    .bitwiseAnd(cloudBitMask)
    .eq(0)
    .and(qa.bitwiseAnd(cirrusBitMask).eq(0));

  return image.updateMask(mask);
}
//select the required dataset
var dataset = s2
  .filterDate("2018-05-01", "2018-12-30")
  .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 80))
  .filterBounds(aoi)
  .map(function (img) {
    return img.clip(aoi);
  })
  .map(maskS2clouds);
Map.addLayer(aoi, {}, "aoi", false);

print(dataset);

// extract the required bands
var required_bands = ["B4", "B3", "B2", "B8"];
dataset = dataset.median().select(required_bands);

Map.addLayer(dataset, rgb_vis, "dataset (without cloud)");

Map.centerObject(aoi, 12);

//select the required dataset
var dataset_with_cloud = s2
  .filterDate("2018-05-01", "2018-12-30")
  .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 20))
  .filterBounds(aoi)
  .map(function (img) {
    return img.clip(aoi);
  });
// .map(maskS2clouds)

Map.addLayer(dataset_with_cloud, rgb_vis, "dataset (with cloud)");

// Export the image
Export.image.toDrive({
  image: dataset,
  description: "s2",
  region: aoi,
  scale: 10,
});
