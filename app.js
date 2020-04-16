const margin = {
    top: 50,
    bottom: 50,
    right: 70,
    left: 70
};

function plotWidth() { return +d3.select("svg").attr("width") - margin.left - margin.right; }
function plotHeight() { return +d3.select("svg").attr("height") - margin.top - margin.bottom; }


function xPartition(record) {
    return {
        label: `Cluster ${record.label0}`,
        record: record
    };
}

// can use in future to reduce the dataset to a subset of interesting values
// for example: top contributing active-substances (which we then partition by)
function rawDatasetFiter(item) {
    // for simplicity on binning and axis maintenance, discard outliers; this also 
    // removes any ages in other units (minutes/weeks since birth, etc.)
    return item.age > 0 && item.age < 100;
}



let maxBubbleSize = maxBubbleColor = 0;
let minBubbleSize = minBubbleColor = Number.MAX_VALUE;


function reducer(accumulator, record, idx, sourceArr) {
    accumulator = accumulator || []
    let bin = ageBin(record);
    let index = bin / ageBinSize;

    if (!accumulator[index])
        accumulator[index] = { bubbleSize: 0, bubbleColor: 0 };

    accumulator[index].bubbleSize += 1; // "count" aggregation (number of incidents)
    accumulator[index].bubbleColor += record.seriousness / sourceArr.length; // "seriousness" aggregation (avg)

    // keep track of global min/max values for scaling later
    if (accumulator[index].bubbleSize > maxBubbleSize) maxBubbleSize = accumulator[index].bubbleSize;
    if (accumulator[index].bubbleSize < minBubbleSize) minBubbleSize = accumulator[index].bubbleSize;

    if (accumulator[index].bubbleColor > maxBubbleColor) maxBubbleColor = accumulator[index].bubbleColor;
    if (accumulator[index].bubbleColor < minBubbleColor) minBubbleColor = accumulator[index].bubbleColor;

    return accumulator;
}

function ageBin(record) {
    return record.age - record.age % ageBinSize;
}

function dataPrep() {
    let filteredDataset = dataset.filter(rawDatasetFiter);

    // partition dataset into x-axis groups
    partitioned = {};
    for (let i = 0; i < filteredDataset.length; i++) {
        let record = filteredDataset[i];
        let p = xPartition(record);

        // each partition will have a 'M' and 'F' property - each an array of its gender-records
        partitioned[p.label] = partitioned[p.label] || { M: [], F: [] };
        if (record.sex === "M") partitioned[p.label].M.push(record);
        else partitioned[p.label].F.push(record);
    }

    // aggregations over our dimensions of interest
    for (partition in partitioned) {
        partitioned[partition].M = partitioned[partition].M.reduce(reducer, Array(100 / ageBinSize));
        partitioned[partition].F = partitioned[partition].F.reduce(reducer, Array(100 / ageBinSize));
    }
}

function plot() {
    let groupNames = [];
    for (_ in partitioned) groupNames.push(_);
    let x_bandScale = d3.scaleBand()
        .domain(groupNames)
        .range([0, plotWidth()])
        .padding(0.1);

    svg = d3.select("svg");

    let chartContainer = svg.append("g")
        .attr("transform", `translate(${margin.left}, ${margin.top})`);

    const xAxis = d3.axisBottom(x_bandScale);
    chartContainer.append("g")
        .call(xAxis)
        .attr("transform", "translate(0," + plotHeight() + ")");

    const yScale = d3.scaleLinear().domain([1, 100]).range([plotHeight(), 0])
    chartContainer.append("g")
        .call(d3.axisLeft(yScale));

    const bubbleSizeScale = d3.scaleSqrt().domain([minBubbleSize, maxBubbleSize]).range([0, 10]); // TODO: set a sensible max radius here based on x_bandScale

    groupNames.forEach(function (grp) {

        let arr = partitioned[grp].M;
        let m = arr;

        chartContainer.selectAll("circle." + '_' + groupNames.indexOf(grp))
            .data(m)
            .enter()
            .append("circle")
            .attr("cx", x_bandScale(grp))
            .attr("cy", d => yScale(ageBinSize * m.indexOf(d)+5)) // ignore when d is 'undefined'
            .attr("r", function (d) {
                if (d) {
                    return bubbleSizeScale(d.bubbleSize);
                } else {
                    return 0;
                }
            })
            .attr("stroke", "black")
            .attr("fill", "red");
        //let f = partitioned[grp].F
    })

}

function go() {
    dataPrep();
    plot();
}

// the typed data from a csv
let dataset;
// data partitioned on the x-axis grouping, and aggregated by age-bin, and x-axis-group/sex
let partitioned;

// number of "bins" to use for aggregation
const ageBinSize = 5;


function ready() {
    d3.csv("./datasets/headache_c3_cluster.csv", (record) => {
        return {
            index: +record.index,
            sex: record.patientsex == 1 ? "M" : "F",
            age: +record.patientonsetage,
            activesubstance: record.activesubstance,
            seriousness: +record.seriousness,
            label0: record.labels
        };
    }).then((data) => {
        dataset = data;
        go();
    });
}


document.addEventListener("DOMContentLoaded", ready);