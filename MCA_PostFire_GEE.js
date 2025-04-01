//================ Post-fire Environmental Assessment =================//
//================            GEE script              =================//
//                    Author Irina Cristal, date: 8/8/2024
//                      Project: TREEADS - UdG
// Background
//
// Wildfires are becoming increasingly more severe, necessitating a better understanding of the ecosystem responses to 
// assist ecosystem recovery. Based on remote sensing data and national-level datasets on soil and vegetation, 
// within the geographical scope of Avila province, Castilla Leon, Spain, this code presents a workflow to obtain maps that can help in 
// post-fire ecological restoration decision making:
//   1. Fire Severity Map; 2. Fire recurrence vulnerability map; 3. Post-fire soil erosion risk map; 
//   4. Vegetation recovery potential map;

// Cite this work: 
// I. Cristal, E. Puigdemasa, M. Palmero-Iniesta, E. Mauri, P. Pons, 
// Enhancing Post-Fire Decision-Making: A Framework for Rapid Wildfire Impact Assessment and Evidence-Based Management Planning. 
// Available at SSRN: https://ssrn.com/abstract=5191996 or http://dx.doi.org/10.2139/ssrn.5191996
 

// import functions
var funcs = require('users/irinacristal/pf-avila:funcs')


//===== Step 1: Obtain burn scar data and select area of interest (fire polygon) based on date and ID ===========================

// Load fire history polygons from EFFIS database (monthly fire history: https://maps.effis.emergency.copernicus.eu/effis?service=WFS&request=getfeature&typename=ms:modis.ba.poly&version=1.1.0&outputformat=SHAPEZIP&pk_vid=a300506a9de79f37172492105303a82b)
// Todo: automatize download
var fire_history = ee.FeatureCollection('projects/ee-irinacristal/assets/fire_histo_avila');
// Convert fire date to ee.Date format (EFFIS shp attributes are all string)
fire_history = fire_history.map(function(feature) {
  var date_str = feature.get('FIREDATE')
  var fdate = ee.Date.parse('YYYY-MM-dd HH:mm:ss', date_str)
  fdate = ee.Date(fdate.format('YYYY-MM-dd'))
  return feature.set('date', fdate)
});


// Modify dates to search fire perimeters (area of interest) wihtin the fire history dataset
var start_date = ee.Date('2021-08-14'); //parameras
//var start_date = ee.Date('2022-08-05');
var end_date = ee.Date('2021-08-14'); //parameras
//var end_date = ee.Date('2022-08-27');

// Check fire list 
var filteredCollection = fire_history.filter(ee.Filter.and(
  ee.Filter.gte('date', start_date), // change date "from"
  ee.Filter.lte('date', end_date) // change date "to"
));

// Format each feature's information
var formatFeature = function(feature) {
  var id = feature.get('id');
  var name = feature.get('COMMUNE');
  var area = feature.get('AREA_HA');
  return ee.String('Fire within selected dates \n')
            .cat(ee.String('ID: '))
            .cat(ee.String(id)).cat(' commune:')
            .cat(ee.String(name)).cat(' area(ha): ')
            .cat(ee.String(area));
};

// Map over the FeatureCollection to format each feature
var formattedFeatures = filteredCollection.map(function(feature) {
  return ee.Feature(null, {formatted: formatFeature(feature)});
});
/*

// Print the formatted features /*
formattedFeatures.aggregate_array('formatted').evaluate(function(result) {
  result.forEach(function(line) {
    print(line);
  });
});
// copy ID from console

*/

//======================================= USER INPUT ===================================================
// Requirements: fire ID from the previous step & dates of the fire start and end
// NOTE that the current EFFIS dataset DOES NOT HAVE FIRE END DATE!!
//======================================================================================================

// FIRE ID for Santa Cruz wildfire = 208633; Paramera = 52448
var targetID = '208633'

var area = fire_history.filter(ee.Filter.eq('id', targetID))
//print("area: ", area);
//var area = ee.FeatureCollection("projects/ee-irinacristal/assets/input_parameras/SantaCruz_perim");// extracted perimeter


// Set date ranges to search satellite images before and after fire based on the targetID
var prefire_start, prefire_end, postfire_start, postfire_end;

if (targetID === '52448') { // For Parameras
    prefire_start = '2021-07-30';
    prefire_end = '2021-08-13';
    postfire_start = '2021-08-21';
    postfire_end = '2021-10-21';
} else if (targetID === '208633') { // For Santa Cruz
    prefire_start = '2022-07-14';
    prefire_end = '2022-08-04';
    postfire_start = '2022-08-28';
    postfire_end = '2022-10-25';
}

//======================================================================================================
//====================================== END OF USER INPUT =============================================
//======================================================================================================
Map.centerObject(area, 12);

//======================================================================================================
// STEP 3. LOAD DATA:
//  Fire recurrence vulnerability as a function of fire frequency and years since the last fire
//  Resprouters cover: %resprouting spp/map unit (based on Spanish Forest Map 2017)
//  Digital Elevation Model (5m)
// - Calculate slope and aspect
//======================================================================================================

// Apply function that calculates fire recurrence vulnerability score (1 to 3)
var fire_recurrence_score = funcs.recurrence_vulnerability(prefire_end, area, fire_history).clip(area);

// STEP 4. %OF RESPROUTING SPECIES based on Spanish Forest Map
// Load resprouter cover pre fire - percent of resprouting species per Fores Map Unit
var resp = ee.Image("projects/ee-irinacristal/assets/input_parameras/resp_cover").clip(area); // 5m
Map.addLayer(resp, {min: 0, max: 100, palette: ['yellow', 'orange', 'green']}, 'Resprouters coverage');

// Load 5m DEM and clip to the AOI
var dem = ee.Image("projects/ee-irinacristal/assets/input_parameras/MDT05_avila").clip(area); // 5m DEM

//Add DEM to map
//Map.addLayer(dem, {min: 0, max: 2700, palette: ['green', 'yellow', 'brown']});

// Calculate slope from the DEM
var terrain = ee.Terrain.products(dem);
var slope = terrain.select('slope');

// Calculate aspect:
var aspect = terrain.select('aspect');
//Add slope to map
//Map.addLayer(slope.visualize({min: 0, max: 90,  palette: ['green', 'yellow', 'brown']}));

//===============================================================================================================
//STEP 4. LOAD SENTINEL-2 IMAGES AND CALCULATE FIRE SEVERITY INDEX dNBR
//===============================================================================================================

// NOTE: HARMONIZED IMG COLLECTIONS ARE STRONGLY RECOMMENDED:  S2_SR_HARMONIZED or S2_HARMONIZED
//
// METHOD 1. SELECT IMG BASED ON % OF CLOUDY PIXELS: 
// var S2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED');
// //Get the least cloudy img pre-fire: sort cloud percentage, select first
// var prefire = ee.Image(
//   S2.filterBounds(area)
//     .filterDate('2021-07-15', '2021-08-13')
//       // Pre-filter to get less cloudy granules.
//     .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE',0.5))
//   );
// print(prefire);
//-----------------------------------------------------------------------------------------------------------------
// METHOD 2. APPLY CLOUD MASK
// Use code from GEE to mask the clouds

/**
 * Function to mask clouds using the Sentinel-2 QA band
 * @param {ee.Image} image Sentinel-2 image
 * @return {ee.Image} cloud masked Sentinel-2 image
 */
function maskS2clouds(image) {
  var qa = image.select('QA60');

  // Bits 10 and 11 are clouds and cirrus, respectively.
  var cloudBitMask = 1 << 10;
  var cirrusBitMask = 1 << 11;

  // Both flags should be set to zero, indicating clear conditions.
  var mask = qa.bitwiseAnd(cloudBitMask).eq(0)
      .and(qa.bitwiseAnd(cirrusBitMask).eq(0));

  return image.updateMask(mask).divide(10000);
}

function mosaic_clip(start_date, end_date, aoi){
  
  var dataset = ee.ImageCollection('COPERNICUS/S2_HARMONIZED')// ?COPERNICUS/S2_SR_HARMONIZED
                  .filterBounds(area)
                  .filterDate(start_date, end_date)
                  // Pre-filter to get less cloudy granules.
                  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 5))
                  .map(maskS2clouds);
  //print(dataset);
  var mos_clip = dataset.mosaic().clip(area);
  
  return(mos_clip);
}

var prefire_area = mosaic_clip(prefire_start, prefire_end, area);
var postfire_area = mosaic_clip(postfire_start, postfire_end, area);

print('prefire cloud masked Sentinel2 Harmonized',prefire_area)
print('postfire cloud masked Sentinel2 Harmonized',postfire_area)


var visualization = {
  min: 0.0,
  max: 0.3,
  bands: ['B4', 'B3', 'B2'],
};


//Map.addLayer(prefire_area, visualization, 'RGB prefire');
//Map.addLayer(postfire_area, visualization, 'RGB postfire');

//------------------------------------------------------------------------------------------------------
// Calculate fire severity dNBR. Note that there will be visible regeneration, as the post-fire image 
// with a 10% cloud coverage CAN BE FOUND 2 months after the fire event (example of Parameras without cloud mask).
var preNBR = prefire_area.normalizedDifference(['B8', 'B12']);
var postNBR = postfire_area.normalizedDifference(['B8', 'B12']);

var dNBR = preNBR.subtract(postNBR);

// Scale to USGS standards
var dNBR_scaled = dNBR.multiply(1000);

//------------------------------------------------------------------------------------------------------
// VUSUALIZATION AND BURN AREA STATISTICS: Code snippet from UN-spider 
//------------------------------------------------------------------------------------------------------

//------------------------- Burn Ratio Product - Classification -------------------------------------------

// Define an SLD style of discrete intervals to apply to the image.
var sld_intervals =
  '<RasterSymbolizer>' +
    '<ColorMap type="intervals" extended="false" >' +
      '<ColorMapEntry color="#ffffff" quantity="-500" label="-500"/>' +
      '<ColorMapEntry color="#7a8737" quantity="-250" label="-250" />' +
      '<ColorMapEntry color="#acbe4d" quantity="-100" label="-100" />' +
      '<ColorMapEntry color="#0ae042" quantity="100" label="100" />' +
      '<ColorMapEntry color="#fff70b" quantity="270" label="270" />' +
      '<ColorMapEntry color="#ffaf38" quantity="440" label="440" />' +
      '<ColorMapEntry color="#ff641b" quantity="660" label="660" />' +
      '<ColorMapEntry color="#a41fd6" quantity="2000" label="2000" />' +
    '</ColorMap>' +
  '</RasterSymbolizer>';

// Add the image to the map using both the color ramp and interval schemes.
Map.addLayer(dNBR_scaled.sldStyle(sld_intervals), {}, 'dNBR styled',false);

// Seperate result into 8 burn severity classes
var thresholds = ee.Image([-1000, -251, -101, 99, 269, 439, 659, 2000]);
var classified = dNBR_scaled.lt(thresholds).reduce('sum').toInt(); // used in burn area statistics


//------------------------------------------------------------------------------------------------------
//                              ADD BURNED AREA STATISTICS
// Todo: add to UI!

// count number of pixels in entire layer
var allpix =  classified.updateMask(classified);  // mask the entire layer
var pixstats = allpix.reduceRegion({
  reducer: ee.Reducer.count(),               // count pixels in a single class
  geometry: area,
  scale: 10
  });
var allpixels = ee.Number(pixstats.get('sum')); // extract pixel count as a number


// create an empty list to store area values in
var arealist = [];

// create a function to derive extent of one burn severity class
// arguments are class number and class name
var areacount = function(cnr, name) {
 var singleMask =  classified.updateMask(classified.eq(cnr));  // mask a single class
 var stats = singleMask.reduceRegion({
  reducer: ee.Reducer.count(),               // count pixels in a single class
  geometry: area,
  scale: 10
  });
var pix =  ee.Number(stats.get('sum'));
var hect = pix.multiply(100).divide(10000);                // Landsat pixel = 30m x 30m --> 900 sqm
var perc = pix.divide(allpixels).multiply(10000).round().divide(100);   // get area percent by class and round to 2 decimals
arealist.push({Class: name, Pixels: pix, Hectares: hect, Percentage: perc});
};

// severity classes in different order
var names2 = ['NA', 'High Severity', 'Moderate-high Severity',
'Moderate-low Severity', 'Low Severity','Unburned', 'Enhanced Regrowth, Low', 'Enhanced Regrowth, High'];

// execute function for each class
for (var i = 0; i < 8; i++) {
  print( names2[i])
  areacount(i, names2[i]);
  }

print('Burned Area by Severity Class', arealist, '--> click list objects for individual classes');

//------------------------------------------------------------------------------------------------------
//                                  PREPARE FILE EXPORT
//------------------------------------------------------------------------------------------------------

//var id = dNBR.id().getInfo();
      
/*Export.image.toDrive({image: dNBR, scale: 10, description: id, fileNamePrefix: 'dNBR',
  region: area, maxPixels: 1e10});
  */
// Downloads will be availible in the 'Tasks'-tab on the right.
//------------------------------------------------------------------------------------------------------
//--------------------------------- END code UN-spider -------------------------------------------------
//------------------------------------------------------------------------------------------------------

//=======================================================================================================
//                                  SOIL EROSION RISK ASSESSMENT
//=======================================================================================================
//=======================================================================================================
// STEP 5. Calculate Bare Soil Index (BSI)
// BSI will reveal the bare soil - removed vegetation by fire 
//=======================================================================================================
// Select relevant bands
var red = postfire_area.select('B4');   // Red
var nir = postfire_area.select('B8');   // Near Infrared
var green = postfire_area.select('B3'); // Green
var swir = postfire_area.select('B11'); // Shortwave Infrared

// Calculate BSI = ((Red+SWIR) - (NIR+Blue)) / ((Red+SWIR) + (NIR+Blue)) 
var BSI = red.add(swir).subtract(green.add(nir))
              .divide(red.add(swir).add(green.add(nir)));
//print('BSI:', BSI);
//Map.addLayer(BSI, {min: -1, max: 1, palette: grey}, 'BSI greyscale');



//=======================================================================================================
// STEP 6. ESTIMATE POSTFIRE SOIL EROSION RISK
// MCE (weighted sum) of factors affecting post-fire soil erosion: bare soil, fire severity, % of resprouting species 
//
// SEV = 0.11*BSI + 0.09*resp + 0.107*dNBR + 0.11*slope (AHP, n=4)
// eXPERT 1: 0.423*Slo + 0.173*K + 0.27*BSI+0.102*FSI + 0.033*Resp

//=======================================================================================================

// Normalize the images based on the given thresholds: vegetation: max 40% resprouters, slope min 9%, max 80%
// dNBR min 0.1, max 0.66
var bsi_norm = BSI.unitScale(-1, 1); // Normalize BSI [-1, 1] to [0, 1]

// Normalize and invert % Resprouters from [0, 100] focusing on [0, 40]
var resprouters_capped = resp.min(40);
var resprouters_norm = resprouters_capped.subtract(40).multiply(-1).divide(40);


// Note: slope is given in degrees, thresholds are given in percent: 9% ~ 5degrees, 80% ~ 38 degrees.
var slope_norm = slope.unitScale(5, 38); // Normalize Slope [9%, 80%] to [0, 1]
var dNBR_norm = dNBR.unitScale(0.1, 0.66); // Normalize Fire Severity [0.1, 0.66] to [0, 1]

//mask all the K factor values less than 1 (K max) and normalize
var k_factor = kfactor.updateMask(kfactor.lt(1))
k_factor = k_factor.clip(area);
var K_norm = k_factor.unitScale(0.01, 0.55); // Normalize erodibility [0.01, 0.55] to [0,1]

// For the descrete method use scores
var score = kfactor.expression(
  // Expression to classify the image
  'value <= 0.15 ? 1 : (value <= 0.25 ? 2 : (value < 1 ? 3 : -99))', 
  {
    'value': kfactor
  }
);
var k_score = score.updateMask(score.neq(-99))
var sld_int =
  '<RasterSymbolizer>' +
    '<ColorMap type="intervals" extended="false" >' +
      '<ColorMapEntry color="#fffcc1" quantity="0.65" label="-500"/>' +
      //'<ColorMapEntry color="#ffca93" quantity="2" label="-100" />' +
      '<ColorMapEntry color="#ff7169" quantity="1" label="270" />' +
     
    '</ColorMap>' +
  '</RasterSymbolizer>';
  

//Map.addLayer(k_score.sldStyle(sld_int), {}, "K score")


//  0.11425	--> BSI
//  0.305	Soil --> K_norm
//  0.0885	--> Resprouters
//  0.386	--> Slope
//  0.107	--> dBNR

// 4 experts: 
/*
0.107	Fire severity (dBNR)
0.11425	Bare ground (BSI)
0.305	Soil erodibility (K factor)
0.386	Slope
0.0885	% Resprouters

*/
/*

// Apply the weights to each normalized image
var susceptibility = bsi_norm.multiply(0.11425)
   .add(K_norm.multiply(0.305))
   .add(resprouters_norm.multiply(0.0885))
   .add(slope_norm.multiply(0.386))
   .add(dNBR_norm.multiply(0.107));
*/ 
// // Pere: 0.423*Slo + 0.173*K + 0.27*BSI+0.102*FSI + 0.033*Resp

/*
Slope	0.423	0.523	0.291	0.307	0.408	0.390
Soil erodibility (K factor)	0.173	0.13	0.462	0.455	0.267	0.297
Bare ground (BSI)	0.27	0.048	0.098	0.041	0.164	0.124
Fire severity (dBNR)	0.102	0.225	0.04	0.061	0.089	0.103
% Resprouters	0.033	0.075	0.109	0.137	0.072	0.085
Consistency ratio (CR)	3%	9%	8%	4%	9%	7%
*/
var susceptibility = bsi_norm.multiply(0.164) // (BSI)	0.27	0.048	0.098	0.041	0.164	0.124
   .add(K_norm.multiply(0.267)) // (K factor)	0.173	0.13	0.462	0.455	0.267	0.297
   .add(resprouters_norm.multiply(0.072)) // % Resprouters	0.033	0.075	0.109	0.137	0.072	0.085
   .add(slope_norm.multiply(0.408)) // Slope	0.423	0.523	0.291	0.307	0.408	0.390
   .add(dNBR_norm.multiply(0.089)); //(dBNR)	0.102	0.225	0.04	0.061	0.089	0.103


 // Visualization parameters
 var visParams = {
   min: 0,
   max: 1,
   palette: ['blue', 'yellow', 'red']
 };

Map.addLayer(susceptibility.sldStyle(sld_int), {},'Soil Erosion Risk');

//-------------------------------------------------------------------------------------------------------
//============================= END OF SOIL EROSION RISK ASSESSMENT=============================
/*


=========================================================================================================
======================================= **VEGETATION ASSESSMENT** =======================================
=========================================================================================================

Multi Criteria Evaluation (MCE, weighted sum method) of factors influencing vegetation recovery after fire.

| Criteria                            | Description                                                                              | Weight (w) |
|-------------------------------------|------------------------------------------------------------------------------------------|------------|
| Vegetation regeneration potential   | Regeneration strategy rasterized SFM (Spanish Forest Map, 1:25000)                       | 0.65       |
| Aspect (5m)                         | North facing slopes facilitate regeneration due to decreased PET                         | 0.15       |
| Aridity Index (1km)                 | Precipitation patterns - larger scale [https://doi.org/10.1038/s41597-022-01493-1]       | 0.05       |
| Fire severity (10m)                 |                                                                                          | 0.10       |
| Fire recurrence                     |                                                                                          | 0.05       |


Vegetation vulnerability formula: 
(0.65*VV + 0.15*aspect_score + 0.05*aridity_score + 0.1*dNBR_score + 0.05*fire_recurrence_score) / (0.65 + 0.15 + 0.05 + 0.1 + 0.05)
*/

// Step 1: give scores to each variable (1: Low, 2: Medium, 3: High)
// Vegetation has beed pre-processed in its original vector version by assigning:
// 1:resprouters, 2:postfire seeders, 3:seederds, and rasterized to 5m resolution

// Load vegetation "vulnerability" raster
var VV = ee.Image("projects/ee-irinacristal/assets/input_parameras/VV_5m")
VV = VV.unmask(0).clip(area);

// Previously calculated aspect: var aspect = terrain.select('aspect');
// Rank Aspect: 1:[0-90, 270-360] 2:[90-135, 225-270] 3:[135-225]
//print('Aspect', aspect)
// Reclassify aspect into ranks
var aspect_score = aspect.expression(
  'value >= 0 && value <= 90 ? 1 : ' +
  '(value > 270 && value <= 360 ? 1 : ' +
  '(value > 90 && value <= 135 ? 2 : ' +
  '(value > 225 && value <= 270 ? 2 : ' +
  '(value > 135 && value <= 225 ? 3 : 0))))',
  {
    'value': aspect
  }
);


// Visualize the ranked aspect image
Map.addLayer(aspect_score.clip(area), {
  min: 1,
  max: 3,
  palette: ['green', 'yellow', 'red']
}, 'Aspect score', false);

//print('Ranked Aspect Image:', aspect_score);

//Rank fire severity: 1: <0.269 2:0.27 - 0.439 3: > 0.44
var dNBR_score = dNBR.expression(
  // Expression to classify the image
  'value <= 0.269 ? 1 : (value <= 0.439 ? 2 : 3)', 
  {
    'value': dNBR
  }
);

Map.addLayer(dNBR_score.clip(area), {palette: ['green', 'yellow', 'red']}, "Fire Severity (dNBR) score")

// Load Global Aridity Index
var aridity_index = ee.Image("projects/sat-io/open-datasets/global_ai/global_ai_yearly");
/*
|Aridity Index Value|Climate Class|
|:------------------|:------------|
|<0.03              |Hyper Arid   |
|0.03-0.2           |Arid         |
|0.2-0.5            |Semi-Arid    |
|0.5-0.65           |Dry sub-humid|
|>0.65              |Humid        |
*/


/*
Convert back by multiplying by 10,000 [The Aridity Index values reported within the Global Aridity Index_ET0 geodataset
have been multiplied by a factor of 10,000 to derive and distribute the data as integers (with 4 decimal accuracy).
This multiplier has been used to increase the precision of the variable values without using decimals.]
*/

var ai_area = ee.Image(aridity_index.multiply(0.0001)).clip(area);
//print(ai_area);
// Define an SLD style of discrete intervals to apply to the image.
var sld_intervals =
  '<RasterSymbolizer>' +
    '<ColorMap type="intervals" extended="false" >' +
      '<ColorMapEntry color="#ff0000" quantity="0.2" label="0-0.2"/>' +
      '<ColorMapEntry color="#ffff00" quantity="0.5" label="0.2-0.5" />' +
      '<ColorMapEntry color="#00ff00" quantity="2.5" label=">0.5" />' +
    '</ColorMap>' +
  '</RasterSymbolizer>';
  
//Map.addLayer(ai_area.sldStyle(sld_intervals),{},'Aridity index')
Map.addLayer(ai_area,{'min':0,'max':2.5, palette: ['red','yellow', 'green']},'Aridity Index', false)
//Rank Aridity Index (higher values, more humidity): 3:[0,0.2] 2:[0.21,0.5] 1:[0.51-2.5]
var reclassified = ai_area.expression(
  // Expression to classify the image
  'value <= 0.2 ? 3 : (value <= 0.5 ? 2 : 1)', 
  {
    'value': ai_area
  }
);

var aridity_score = reclassified.clip(area);


// Visualize the reclassified image
Map.addLayer(aridity_score, {'min':1, 'max':3, palette: ['green', 'yellow', 'red']}, "Aridity score", false);


Map.centerObject(area, 12);
Map.addLayer(fire_recurrence_score, {min: 1, max: 3, palette: ['green', 'yellow', 'red']}, 'Fire Recurrence Score ', false);

//================ Calculate Vegetation vulnerability using MCE =====================================================
// Formula:
//(0.65*VV + 0.15*aspect_score + 0.05*aridity_score + 0.1*dNBR_score + 0.05*fire_recurrence_score)/(0,65+0.15+0.06+0.1+o.05)
/*
0.41	Regeneration strategy
0.20125	Fire Severity
0.08575	Aspect
0.08825	Aridity
0.21475	Fire recurrence
*/

/*
Regeneration strategy	0.256	0.506	0.426	0.452	0.036	0.335
Fire recurrence	0.355	0.065	0.078	0.361	0.482	0.268
Fire Severity	0.154	0.294	0.309	0.048	0.143	0.190
Aridity	0.154	0.06	0.077	0.062	0.237	0.118
Aspect	0.081	0.075	0.111	0.076	0.102	0.089
Consistency ratio (CR)	1%	5%	8%	4%		6%


*/
// Define the weights
var weightVV = 0.036; // 0.256	0.506	0.426	0.452	0.036	0.335
var weightAspect = 0.102; // 0.081	0.075	0.111	0.076	0.102	0.089
var weightAridity = 0.237; //0.154	0.06	0.077	0.062	0.237	0.118
var weightDNBR =0.143; // 0.154	0.294	0.309	0.048	0.143	0.190
var weightFireRecurrence = 0.482; // 0.355	0.065	0.078	0.361	0.482	0.268

// Calculate the weighted sum
var weightedSum = VV.multiply(weightVV)
  .add(aspect_score.multiply(weightAspect))
  .add(aridity_score.multiply(weightAridity))
  .add(dNBR_score.multiply(weightDNBR))
  .add(fire_recurrence_score.multiply(weightFireRecurrence));
  
//Map.addLayer(VV, {}, "VV")

// Calculate the normalization factor
var normalizationFactor = weightVV + weightAspect + weightAridity + weightDNBR + weightFireRecurrence;

// Normalize the weighted sum
var result = weightedSum.divide(normalizationFactor);
//print('Result Image:', result);

// visualize the result
Map.addLayer(result, {min: 0, max: 3, palette: ['blue','green', 'yellow', 'red']}, 'Vegetation Recovery Potential [0-3]', false);

// Compute min and max values for normalization
var minMax = result.reduceRegion({
  reducer: ee.Reducer.minMax(),
  geometry: result.geometry(),
  scale: 5, // Adjust scale according to image resolution
  maxPixels: 1e9
});

//print('minmax result:', minMax)
// Min-Max normalization to 0-100 range
var min = ee.Number(minMax.get('b1_min'));
//print("vv min value:", min);
var max = ee.Number(minMax.get('b1_max'));
//print("vv max value:", max);
var normalizedResult = result.subtract(min).divide(max.subtract(min)).multiply(100);
//print('Normalized Result Image:', normalizedResult);

// Optionally, visualize the normalized result
Map.addLayer(normalizedResult, {min: 0, max: 100, palette: ['green', 'yellow', 'red']}, 'Normalized Vegetation Recovery Potential', false);


// Define the export parameters
var exportParams = {
  image: result,
  description: 'VegetationVulnerability_Pere',
  //assetId: 'projects/ee-irinacristal/assets/output/pf_vv',
  scale: 5, // Resolution in meters per pixel
  region: area.geometry().bounds(), // Area to export
  maxPixels: 1e13 // Maximum number of pixels allowed to export
};

// Export the image to your GEE assets
//Export.image.toAsset(exportParams);
Export.image.toDrive(exportParams);

//============================== Calculate area occupied by each vulnerability zone =================

// Import the necessary modules
var geometry = area; // Define  region of interest
var image = result/* susceptibility or result */; // Replace as needed

// Define the pixel ranges
/* //ranges for susceptibility (soil risk)
var ranges = [
  {min: -1, max: 0.1, label: 'Range_-1_1'},
  {min: 0.1, max: 0.3, label: 'Range_1_3'},
  {min: 0.3, max: 0.4, label: 'Range_3_4'},
  {min: 0.4, max: 0.6, label: 'Range_4_6'},
  {min: 0.6, max: 1.5, label: 'Range_6_15'} // Adjusted the upper limit
];
*/

//ranges for result (vegetation recovery potential)
var ranges = [
  {min: -1, max: 1, label: '1'},
  {min: 1, max: 2, label: '2'},
  {min: 2, max: 3.5, label: '3'}
  
];

// Function to calculate area for each range
var calculateArea = function(range) {
  var mask = image.gt(range.min).and(image.lt(range.max));
  var areaImage = ee.Image.pixelArea().multiply(mask);
  
  // Specify the band name or use the first band
  var area = areaImage.reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: geometry,
    scale: 5, // Adjust the scale based on your image resolution
    maxPixels: 1e13
  }).get('area'); // Changed 'constant' to 'area'
  
  return ee.Number(area).divide(1e6); // Convert to square kilometers
};

// Calculate areas for each range
var areas = ranges.map(function(range) {
  return {
    range: range.label,
    area: calculateArea(range)
  };
});

// Print the results
print('Areas for each pixel range:', areas);

// Optionally, export the results to Google Drive or Google Cloud Storage
Export.table.toDrive({
  collection: ee.FeatureCollection(areas.map(function(item) {
    return ee.Feature(null, {range: item.range, area: item.area});
  })),
  description: 'PixelRangeAreas',
  fileFormat: 'CSV'
});