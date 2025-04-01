# MCA_Postfire_GEE
This repository contains a Multi-Criteria Analysis (MCA) implementation for assessing post-fire environmental impacts using Google Earth Engine (GEE). The script performs soil erosion risk assessment and vegetation vulnerability analysis using geospatial datasets within the geographic scope of the province of Avila in Central Spain, and particularly in two burned areas: Paramera and Santa Cruz.
## Key Features:
1. Fire Severity Index (dNBR) Calculation 
2. Bare Soil Index (BSI) Calculation 
3. Soil Erosion Risk Estimation (Multi-Criteria Evaluation) 
4. Vegetation Vulnerability Assessment 
5. Data Normalization and Weighted Sum Analysis 
6. Visualizations of Environmental Risk Factors

## Data Sources
The script utilizes the following datasets:
• Satellite Imagery: Sentinel-2 (Bands: B4, B8, B3, B11)
• Fire Severity (dNBR): Derived from Sentinel-2 pre- and post-fire
• Bare Soil Index (BSI): Derived from Sentinel-2 post-fire
• Slope Data: Digital Elevation Model (5m DEM):  External dataset
• Soil Erodibility Factor (K Factor): External dataset
• Vegetation Regeneration Strategy: Spanish Forest Map (1:25000)
• Aridity Index: Global AI Dataset
• Fire Recurrence: Custom dataset from fire history

## Methodology
### 1. Soil Erosion Risk Assessment
• Compute Fire Severity Index (dNBR) and Bare Soil Index (BSI)
• Normalize input factors (BSI, K factor, Slope, dNBR, %Resprouters)
• Apply Multi-Criteria Evaluation (MCE) using expert-assigned weights
• Generate final Soil Erosion Risk Map

### 2. Vegetation Recovery Assessment
• Classify vegetation types based on resprouting potential
• Rank terrain aspect and aridity index for regeneration favorability
• Integrate fire severity and fire history
• Compute Vegetation Recovery Potential using weighted sum

## Visualization
The script includes custom visualization parameters for mapping soil erosion risk and vegetation vulnerability with color-coded outputs:
• Blue → Low Risk
• Yellow → Moderate Risk
• Red → High Risk

## Running the Code in GEE
1.	Open Google Earth Engine
2.	Create a new script and paste the contents of MCA_PostFire_ImpactAssessment_GEE.js
3.	Modify the study area (area) as needed
4.	Run the script to generate maps and analysis
   
## How to Cite
If you use this code in your research, please cite:
Cristal et al. (2025). Enhancing Post-Fire Decision-Making: A Framework for Rapid Wildfire Impact Assessment and Evidence-Based Management Planning. 
Available at SSRN: https://ssrn.com/abstract=5191996 or http://dx.doi.org/10.2139/ssrn.5191996

