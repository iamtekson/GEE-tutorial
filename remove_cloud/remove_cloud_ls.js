var landsat7 = ee.ImageCollection("LANDSAT/LE07/C02/T1_L2"),
  landsat5 = ee.ImageCollection("LANDSAT/LT05/C02/T1_L2"),
  landsat8 = ee.ImageCollection("LANDSAT/LC08/C02/T1_L2"),
  rgb_vis = {
    opacity: 1,
    bands: ["SR_B3", "SR_B2", "SR_B1"],
    min: 8052.51,
    max: 20892.99,
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
// function to mask the cloud in landsat dataset
function maskLandsatClouds(image) {
  //Bit 0 - Fill
  //Bit 1 - Dilated Cloud
  //Bit 2 - Cirrus
  //Bit 3 - Cloud
  //Bit 4 - Cloud Shadow
  var qa = image.select("QA_PIXEL");

  //If the cloud bit (3) is set and the cloud shadow (4) is high
  var cloud = qa
    .bitwiseAnd(1 << 3)
    .eq(0)
    .and(qa.bitwiseAnd(1 << 4).eq(0));

  //Remove edge pixels that don't occur in all bands
  var mask = image.updateMask(cloud);

  return mask;
}

var dataset = landsat7
  .filterDate("2005-05-01", "2005-12-30")
  .filter(ee.Filter.lt("CLOUD_COVER", 5))
  .filterBounds(aoi)
  .map(function (img) {
    return img.clip(aoi);
  });
// .map(maskLandsatClouds)

// var dataset = landsat8
//                   .filterDate('2020-11-01', '2020-12-30')
//                   .filter(ee.Filter.lt('CLOUD_COVER',70))
//                   .filterBounds(aoi)
//                   .map(function(img) {return img.clip(aoi)})
//                   .map(maskLandsatClouds)

// extract the required bands
var required_bands = ["SR_B3", "SR_B2", "SR_B1"];
var l_dataset = dataset.median().select(required_bands);

Map.addLayer(l_dataset, rgb_vis, "dataset true color");

Map.centerObject(aoi, 12);

// Export the image
Export.image.toDrive({
  image: dataset,
  description: "landsat",
  region: aoi,
  scale: 30,
});
