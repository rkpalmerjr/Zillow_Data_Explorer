/* Kevin Palmer, 2019 */

//First line of main.js...wrap everything in a self-executing anonymous function to move local scope
(function(){

	//Pseudo-global variables
	let attrArray = ["2018_ZHVI_ALL", "2018_ZHVI_SFR", "2018_ZHVI_CONDO", "2018_MED_VAL_SF", "2018_PCT_HOMES_INC_VAL", "2018_PCT_HOMES_DEC_VAL"]; //List of attributes
	let expressed = attrArray[0]; //Initial attribute

	//Chart frame dimensions
	let chartWidth = window.innerWidth * 0.425,
		chartHeight = 600,
		leftPadding = 50,
		rightPadding = 5,
		topPadding = 5,
		chartInnerWidth = chartWidth - leftPadding - rightPadding,
		chartInnerHeight = chartHeight - topPadding - 5,
		translate = "translate(" + leftPadding + "," + topPadding + ")";

	//Create a scale to size bars proportionally to frame
	let yScale = d3.scaleLinear()
		.range([0, 595])
		.domain([0, 800000]);  //<--THIS NEEDS TO BE DYNAMIC!!!

//Begin script when window loads
	window.onload = setMap();

	function setMap() {

		//Map frame dimensions
		let width = window.innerWidth * 0.5;
		let height = 600;

		//Create a new svg container for the map
		let map = d3.select("body")
			.append("svg")
			.attr("class", "map")
			.attr("width", width)
			.attr("height", height);

		//Create Albers equal area conic projection centered on France
		let projection = d3.geoMercator()
			.center([-77.4824, 38.81709])
			.scale(15000)
			.translate([width / 2, height / 1.9]);

		let path = d3.geoPath()
			.projection(projection);

		//Use promises instead of queue to parallelize asynchronous data loading
		let zillowData = d3.csv("data/DMV_Counties_Joined.csv");
		console.log("Pending zillowData promise: ", zillowData);
		let dmvStatesTopo = d3.json("data/DMV_States.topojson");
		console.log("Pending statesTopo promise: ", dmvStatesTopo);
		let dmvMSATopo = d3.json("data/DMV_MSA.topojson");
		console.log("Pending dmvMSATopo promise: ", dmvMSATopo);
		let dmvCountiesTopo = d3.json("data/DMV_Counties_Min.topojson");
		console.log("Pending countiesTopo promise: ", dmvCountiesTopo);

		promises = [zillowData, dmvStatesTopo, dmvMSATopo, dmvCountiesTopo];
		console.log("Pending promises array: ", promises);

		Promise.all(promises).then(function (values) {
			console.log("Resolved promises array: ", promises);
			let zillowData = values[0];
			console.log("Resolved zillowData array: ", zillowData);
			let dmvStatesGeo = topojson.feature(values[1], values[1].objects.DMV_States).features;
			console.log("Resolved states object: ", dmvStatesGeo);
			let dmvMSAGeo = topojson.feature(values[2], values[2].objects.DMV_MSA).features;
			console.log("Resolved dmvMSA object: ", dmvMSAGeo);
			let dmvCountiesGeo = topojson.feature(values[3], values[3].objects.DMV_Counties_Min);
			console.log("Resolved counties object: ", dmvCountiesGeo);

			//Join csv data to GeoJson enumeration units
			joinData(dmvCountiesGeo, zillowData);
			console.log("Joined Counties Data: ", dmvCountiesGeo);

			//Create color scale
			let colorScale = makeColorScale(zillowData);
			console.log(colorScale);

			//Add enumeration units to the map
			setEnumerationUnits(dmvCountiesGeo, map, path, colorScale);

			//Add states to the map
			let dmvStates = map.selectAll(".dmvStates")
				.data(dmvStatesGeo)
				.enter()
				.append("path")
				.attr("class", function (d) {
					return "dmvStates " + d.properties.NAME;
				})
				.attr("d", path);

			//Add DMV MSA to the map
			let dmvMSA = map.selectAll(".dmvMSA")
				.data(dmvMSAGeo)
				.enter()
				.append("path")
				.attr("class", function (d) {
					return "dmvMSA " + d.properties.NAME;
				})
				.attr("d", path);

			//Add coordinated visualization to the map
			setChart(zillowData, colorScale);

			//Add dropdown to the map
			createDropdown(attrArray, zillowData);
		});
	}; //End of setMap()

	function joinData(dmvCountiesGeo, zillowData){
		//Loop through csv to assign each set of csv attribute values to geojson county
		for (let i = 0; i < zillowData.length; i++) {
			console.log(zillowData[i]);
			let csvCounty = zillowData[i]; //The current county
			let csvKey = csvCounty.CountyFIPS; //The CSV primary key

			//Loop through geojson counties to find the correct county
			for (let a = 0; a < dmvCountiesGeo.features.length; a++) {
				//console.log(counties.features[a]);
				let geojsonProps = dmvCountiesGeo.features[a].properties; //The current county geojson properties
				let geojsonKey = geojsonProps.CountyFIPS; //The geojson primary key


				//Where primary keys match, transfer csv data to geojson properties object
				if (geojsonKey == csvKey) {
					//Assign all attributes and values
					attrArray.forEach(function (attr) {
						let val = parseInt(csvCounty[attr]); //Get csv attribute value
						geojsonProps[attr] = val; //Assign attribute and value to geojson properties
					});
				};
			};
		};
	};

	function setEnumerationUnits(dmvCountiesGeo, map, path, colorScale){
		let counties = map.selectAll(".counties")
			.data(dmvCountiesGeo.features)
			.enter()
			.append("path")
			.attr("class", function(d){
				return "counties " + d.properties.NAMELSAD_MIN;
			})
			.attr("d", path)
			.style("fill", function(d){
				return choropleth(d.properties, colorScale);
			})
			.on("mouseover", function(d){
				highlight(d.properties);
			})
			.on("mouseout", function(d){
				dehighlight(d.properties);
			})
			.on("mousemove", moveLabel);

		console.log(counties);

		//Add style descriptor to each path
		let desc = counties.append("desc")
			.text('{"stroke": "#000", "stroke-width": "1px"}');
	};

	//Function to create color scale generator
	function makeColorScale(data){
		let colorClasses = [
			"#eff3ff",
			"#bdd7e7",
			"#6baed6",
			"#3182bd",
			"#08519c"
		];

		//Create color scale generator
		let colorScale = d3.scaleThreshold()
			.range(colorClasses);
		console.log(colorScale);

		//Build array of all values of the expressed attribute
		let domainArray = [];
		for (let i=0; i<data.length; i++){
			let val = parseInt(data[i][expressed]);
			domainArray.push(val);
		};

		//Cluster data using ckmeans clustering algorithm to create natural breaks
		let clusters = ss.ckmeans(domainArray, 5);
		//Reset domain array to cluster minimums
		domainArray = clusters.map(function(d){
			return d3.min(d);
		});

		//Remove first value from the domain array to create class breakpoints
		domainArray.shift();

		//Assign array last 4 cluster minimums as domain
		colorScale.domain(domainArray);

		return colorScale;
	};

	//Function to test for data value and return color
	function choropleth(props, colorScale){
		//Make sure attribute value is a number
		let val = parseInt(props[expressed]);

		//If attribute value exists, assign a color; otherwise assign black
		if (typeof val == "number" && val != 0){
			return colorScale(val);
		}else{
			return "#000000";
		};
	};

	//Function to create the coordinated bar chart
	function setChart(zillowData, colorScale){
		//Create a second svg element to hold the bar chart
		let chart = d3.select("body")
			.append("svg")
			.attr("width", chartWidth)
			.attr("height", chartHeight)
			.attr("class", "chart");

		//Create a rectangle for the chart background fill
		let chartBackground = chart.append("rect")
			.attr("class", "chartBackground")
			.attr("width", chartInnerWidth)
			.attr("height", chartInnerHeight)
			.attr("transform", translate);

		//Set bars for each county
		let bars = chart.selectAll(".bars")
			.data(zillowData)
			.enter()
			.append("rect")
			.sort(function(a, b){
				return b[expressed] - a[expressed]
			})
			.attr("class", function(d){
				return "bars " + d.NAMELSAD_MIN;
			})
			.attr("width", chartInnerWidth / zillowData.length - 1)
			.on("mouseover", highlight)
			.on("mouseout", dehighlight)
			.on("mousemove", moveLabel);

		//Add style descriptor to each rect
		let desc = bars.append("desc")
			.text('{"stroke": "none", "stroke-width": "0px"}');

		//Create text element for the chart title
		let chartTitle = chart.append("text")
			.attr("x", 175)
			.attr("y", 60)
			.attr("class", "chartTitle")

		//Create vertical axis generator
		let yAxis = d3.axisLeft()
			.scale(d3.scaleLinear().range([590,0]).domain([0,800000]));

		//Place axis
		let axis = chart.append("g")
			.attr("class", "axis")
			.attr("transform", translate)
			.call(yAxis);

		//Create frame for chart border
		let chartFrame = chart.append("rect")
			.attr("class", "chartFrame")
			.attr("width", chartInnerWidth)
			.attr("height", chartInnerHeight)
			.attr("transform", translate);

		updateChart(bars, zillowData.length, colorScale);
	}; //End of setChart()

	//Function to create a dropdown menu for attribute selection
	function createDropdown(attrArray, zillowData) {
		//Add select element
		let dropdown = d3.select("body")
			.append("select")
			.attr("class", "dropdown")
			.on("change", function () {
				changeAttribute(this.value, zillowData)
			});

		//Add initial option
		let titleOption = dropdown.append("option")
			.attr("class", "titleOption")
			.attr("disabled", "true")
			.text("Select Attribute");

		//Add attribute name options
		let attrOptions = dropdown.selectAll("attrOptions")
			.data(attrArray)
			.enter()
			.append("option")
			.attr("value", function (d) {
				return d
			})
			.text(function (d) {
				return d
			});
	};

	//Dropdown change listener handler
	function changeAttribute(attribute, zillowData){
		//Change the expressed attribute
		expressed = attribute;

		//Recreate the color scale
		let colorScale = makeColorScale(zillowData);
		console.log(colorScale);

		//Recolor enumeration units
		let counties = d3.selectAll(".counties")
			.transition()
			.duration(1000)
			.style("fill", function(d){
				return choropleth(d.properties, colorScale)
			});

		//Re-sort, resize, and recolor bars
		let bars = d3.selectAll(".bars")
		//Re-sort bars
			.sort(function(a, b){
				return b[expressed] - a[expressed];
			})
			.transition()
			.delay(function(d, i){
				return i * 20
			})
			.duration(500);

		updateChart(bars, zillowData.length, colorScale);
	}; //End of changeAttribute()

	function updateChart(bars, n, colorScale){
		//Position bars
		bars.attr("x", function(d, i){
				return i * (chartWidth / n) + leftPadding;
			})
			//Size/resize bars
			.attr("height", function(d, i){
				console.log([expressed]);
				return yScale(parseInt(d[expressed]));
			})
			.attr("y", function(d){
				return 590 - yScale(parseInt(d[expressed])) + topPadding;
			})
			.style("fill", function(d){
				return choropleth(d, colorScale);
			})
		let chartTitle = d3.select(".chartTitle")
			.text(function(d){
				if ([expressed] == "2018_ZHVI_ALL"){
					return "2018 Average ZHVI (All Homes)";
				} if ([expressed] == "2018_ZHVI_SFR"){
					return "2018 Average ZHVI (Single Family Residences)";
				} if ([expressed] == "2018_ZHVI_CONDO"){
					return "2018 Average ZHVI (Condominiums)";
				} if ([expressed] == "2018_MED_VAL_SF"){
					return "2018 Median Home Value per Square Foot";
				} if ([expressed] == "2018_PCT_HOMES_INC_VAL"){
					return "2018 Percent of Homes Increased in Value";
				} if ([expressed] == "2018_PCT_HOMES_DEC_VAL"){
					return "2018 Percent of Homes Decreased in Value";
				};
			});
	}

	//Function to highlight enumeration units and bars
	function highlight(props){
		//Change stroke
		let selected = d3.selectAll("." + props.NAMELSAD_MIN)
			.style("stroke", "yellow")
			.style("stroke-width", "6");

		setLabel(props);
	};

	//Function to dehighlight enumeration units and bars
	function dehighlight(props){
		let selected = d3.selectAll("." + props.NAMELSAD_MIN)
			.style("stroke", function(){
				return getStyle(this, "stroke")
			})
			.style("stroke-width", function(){
				return getStyle(this, "stroke-width")
			});
		function getStyle(element, styleName){
			let styleText = d3.select(element)
				.select("desc")
				.text();

			let styleObject = JSON.parse(styleText);

			return styleObject[styleName];
		};

		d3.select(".infoLabel")
			.remove();
	};

	//Function to create dynamic label
	function setLabel(props){
		//Label content
		let labelAttribute = "<h1>" + props[expressed] +
			"</h1><b>" + expressed + "</b>";

		//Create info label div
		let infoLabel = d3.select("body")
			.append("div")
			.attr("class", "infoLabel")
			.attr("id", props.NAMELSAD_MIN + "_label")
			.html(labelAttribute);

		let countyName = infoLabel.append("div")
			.attr("class", "countyName")
			.html(props.NAMELSAD);
	};

	//Function to move info label with mouse
	function moveLabel(){
		//Get width of label
		let labelWidth = d3.select(".infoLabel")
			.node()
			.getBoundingClientRect()
			.width;
		//Use coordinates of mousemove event to set label coordinates
		let x1 = d3.event.clientX + 10,
			y1 = d3.event.clientY - 75,
			x2 = d3.event.clientX - labelWidth - 10,
			y2 = d3.event.clientY + 25;

		//Horizontal label coordinate, testing for overflow
		let x = d3.event.clientX > window.innerWidth - labelWidth - 20 ? x2 : x1;
		//Vertical label coordinate, testing for overflow
		let y = d3.event.clientY < 75 ? y2: y1;

		d3.select(".infoLabel")
			.style("left", x + "px")
			.style("top", y + "px");
	};
})(); //Last line of main.js
