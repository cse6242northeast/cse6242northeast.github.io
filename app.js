/**
 * The margin within the SVG element around the 'chartContainer' `g` element with the axes & graphics
 */
const margin = {
    top: 50,
    bottom: 50,
    right: 70,
    left: 70
};

/**
 * An svg `g` element within the svg which contains the chart boundary (svg less the margins)
 */
let chartContainer;

/**
 * The names of the groups on the x-axis
 */
let groupNames;

/**
 * The d3 band scale housing the groups on the x-axis
 */
let x_bandScale;

let y_scale;

/**
 * A d3 square-root (power) scale for sizing the bubble radius to represent some data dimension in the binned age groups
 */
let bubbleSizeScale;

/**
 * a zero to 1 scale for bubble color (light to dark)
 */
let hueScale;

/**
 * the typed data from a csv: set up in the d3.csv(url,<callback>) callback
 */
let dataset;

/**
 * 'partitioned' is the data-set partitioned by the major x-axis groups (like clusters, or seriousness); sub-
 * groups within the partition are always "M" (male), and "F" (female)
 */
let partitioned;

/**
 * The width of the age "bins". ie. if value is 5, then the bins are 0-5, 5-10, 10-15, etc.
 * Because we've assumed a max age of 100, this must be a divisor of 100
 */
let ageBinSize = 5;

/**
 * The distance from the edges of the band to start plotting bubbles
 */
let sep = 1 / 3;

/**
 * the chartContainer width - calculated from svg width and 
 */
function plotWidth() { return +d3.select("svg").attr("width") - margin.left - margin.right; }
function plotHeight() { return +d3.select("svg").attr("height") - margin.top - margin.bottom; }


/**
 * Partitions the raw data into groupings for display on the x-axis
 * @param {*} record 
 */
function xPartition(record) {
    return {
        // label: 'only one clutesr',//`Cluster ${record.label0}`,
        label: `Cluster ${record.label0}`,
        record: record
    };
}

// can use in future to reduce the dataset to a subset of interesting values
// for example: top contributing active-substances (which we then partition by)
function rawDatasetFiter(item) {
    // for simplicity on binning and axis maintenance, discard outliers; this also 
    // removes any ages in other units (minutes/weeks since birth, etc.)
    return item.age >= 1 && item.age < 100;
}

let maxBubbleSize = maxBubbleColor = 0;
let minBubbleSize = minBubbleColor = Number.MAX_VALUE;


/**
 * The reducer is how we get the aggregations by "bubble". Individual events (record)
 * @param {*} accumulator - the array of aggregated data (within a partition) which holds data aggregated by age bin/bucket
 * @param {*} record - an individual record to add to the bubble aggregation
 */
function getReducer(forGender) {
    return function reducer(accumulator, record, idx, sourceArr) {
        accumulator = accumulator || []
        let bin = ageBin(record);
        let index = bin / ageBinSize;

        if (!accumulator[index])
            accumulator[index] = { bubbleSize: 0, bubbleColor: 0, ageBin: bin, gender: forGender };

        accumulator[index].bubbleSize += 1; // "count" aggregation (number of incidents)
        accumulator[index].bubbleColor += record.seriousness;// / sourceArr.length; // "seriousness" aggregation (avg)

        // keep track of global min/max values for scaling later
        if (accumulator[index].bubbleSize > maxBubbleSize) maxBubbleSize = accumulator[index].bubbleSize;
        if (accumulator[index].bubbleSize < minBubbleSize) minBubbleSize = accumulator[index].bubbleSize;

        if (accumulator[index].bubbleColor > maxBubbleColor) maxBubbleColor = accumulator[index].bubbleColor;
        if (accumulator[index].bubbleColor < minBubbleColor) minBubbleColor = accumulator[index].bubbleColor;

        return accumulator;
    }
}


function ageBin(record) {
    return record.age - record.age % ageBinSize;
}

/**
 * Takes the raw dataset, partitions it into the major x-axis groups, then 
 * partitions those into M/F, and runs aggregation on age bins
 */
function dataPrep() {
    let filteredDataset = dataset.filter(rawDatasetFiter);
    vm.data = filteredDataset;

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
        partitioned[partition].M = partitioned[partition].M.reduce(getReducer("M"), Array(100 / ageBinSize));
        partitioned[partition].F = partitioned[partition].F.reduce(getReducer("F"), Array(100 / ageBinSize));
    }
}

function plot() {
    groupNames = [];
    for (_ in partitioned) groupNames.push(_);
    x_bandScale = d3.scaleBand()
        .domain(groupNames)
        .range([0, plotWidth()])
        .padding(0.1);

    svg = d3.select("svg");
    svg.select("*").remove();

    chartContainer = svg.append("g")
        .attr("transform", `translate(${margin.left}, ${margin.top})`);
    console.log(chartContainer);

    const xAxis = d3.axisBottom(x_bandScale);
    chartContainer.append("g")
        .call(xAxis)
        .attr("transform", "translate(0," + plotHeight() + ")");

    yScale = d3.scaleLinear().domain([1, 100]).range([plotHeight(), 0])
    chartContainer.append("g")
        .call(d3.axisLeft(yScale));

    bubbleSizeScale = d3.scaleSqrt().domain([minBubbleSize, maxBubbleSize]).range([0, maxBubbleRadius()]);
    hueScale = d3.scaleLinear().domain([0, maxBubbleColor]).range([0.25, 1]); // 0-1 needed for d3-scale-chromatic 

    groupNames.forEach(function (grp) {
        // set up M & F veritical bubble-plots
        let arr_m = partitioned[grp].M;
        let arr_f = partitioned[grp].F;
        plotVerticalBubbles("M", arr_m, grp);
        plotVerticalBubbles("F", arr_f, grp);
    })
}

/**
 * Calculate max bubble radius based on the band widths, and the number of age bins
 */
function maxBubbleRadius() {
    let bandwidth = x_bandScale.bandwidth();
    let numBins = 100 / ageBinSize;

    let yAxisDeterminedMaxRadius = plotHeight() / numBins / 2;
    let xAxisDeterminedMaxRadius = 0.5 * bandwidth - sep * bandwidth;

    let result = Math.min(xAxisDeterminedMaxRadius, yAxisDeterminedMaxRadius) - 2;
    return Math.max(0, result);
}

function plotVerticalBubbles(gender, data, grp) {
    let cx;
    let bandWidth = x_bandScale.bandwidth();
    // offset M in the "band" by 1/3 the band width, and F by 2/3
    if (gender == "M") cx = x_bandScale(grp) + sep * bandWidth;
    else if (gender == "F") cx = x_bandScale(grp) + (1 - sep) * bandWidth;

    function pairSelector(d, asSelector) {
        if (d) {
            if (asSelector) return `.group_${groupNames.indexOf(grp)}.bin_${data.indexOf(d)}`;
            else return `group_${groupNames.indexOf(grp)} bin_${data.indexOf(d)} ${gender}`;
        }
        else return "";
    }

    chartContainer.selectAll("circle." + 'group_' + groupNames.indexOf(grp) + "." + gender)
        .data(data)
        .enter()
        .append("circle")
        .attr("cx", cx)
        .attr("cy", d => yScale(ageBinSize * data.indexOf(d))) // ignore when d is 'undefined' (no items in bin)
        .attr("r", function (d) {
            if (d) {
                return bubbleSizeScale(d.bubbleSize);
            } else {
                return 0;
            }
        })
        .attr("class", d => pairSelector(d))
        .attr("x", d => gender == "M" ? cx - 3 : cx - 1)
        .attr("fill", d => { if (d) return d3.interpolateOrRd(hueScale(d.bubbleColor)); else return "white"; })
        .on('mouseover', function (d) {
            d3.selectAll(pairSelector(d, true)).classed('outline', true);
        })
        .on('mouseout', function (d) {
            d3.selectAll(pairSelector(d, true)).classed('outline', false);
        })
        .attr("group", grp)
        .attr("gender", gender)
        .attr("index", d => data.indexOf(d))
        .on('click', bubbleClick);

    chartContainer.append("text")
        .text(gender)
        .attr("y", yScale(0) - 8)
        .attr("x", d => gender == "M" ? cx - 4 : cx - 1)
        .attr("font-size", "x-small")
}

function bubbleItem(bubbleEl) {
    let gender = $(bubbleEl).attr('gender');
    let group = $(bubbleEl).attr('group');
    let index = $(bubbleEl).attr('index');

    return partitioned[group][gender][index];
}

function bubbleClick(sender) {
    vm.setAssociationFilter(sender.gender, sender.ageBin)
}

function go() {
    dataPrep();
    plot();
}

function ready() {
    ko.applyBindings(vm);
    vm.run();
}

let vm;
/**
 * For `knockout` library's data-binding features
 */
class AppVm {
    constructor() {
        this.displayTop_nCount = 20;
        this.associations = ko.observableArray();
        this.datasetName = "Headache (reaction)";

        this.binSize = ko.observable(ageBinSize);
    }

    set data(data) {
        this.dataset = data;
        this.setAssociationFilter()
    }

    changeBinSize(newBinSize) {
        this.binSize(newBinSize);
        ageBinSize = newBinSize;
        go();
    }

    run() {
        d3.csv("./datasets/headache_c3_cluster.csv", (record) => {
            return {
                sex: record.patientsex == 1 ? "M" : "F",
                age: +record.patientonsetage,
                activesubstance: record.activesubstance ? record.activesubstance : undefined,
                seriousness: +record.seriousness,
                label0: record.labels
            };
        }).then((data) => {
            dataset = data;
            go();
        });
    }

    setAssociationFilter(subsetGender, subsetAge) {

        let applyOverData = this.dataset;
        this.associations.removeAll();
        if (subsetGender) {
            applyOverData = this.dataset.filter(function (x) {
                return x.age - (x.age % ageBinSize) == subsetAge && x.sex == subsetGender;
            })
        }

        // a map from "association" (drug/effect) to count
        let associationCounts = {};
        applyOverData.forEach(d => {
            associationCounts[d.activesubstance] = associationCounts[d.activesubstance] === undefined ? 1 : associationCounts[d.activesubstance] + 1;
        })

        // get the top associations (drugs/effects) with the current dataset
        let top = [];
        for (let _ in associationCounts) {
            if (top.length == 0) {
                top.push({ association: _, count: associationCounts[_] });
            }
            else {
                // if _'s count is > any of the current top 'n', then replace the lowest one
                for (var i = top.length - 1; i > -1; i--) {
                    if (associationCounts[_] > top[i].count) {
                        top.splice(i + 1, 0, { association: _, count: associationCounts[_] }) // replace
                        if (top.length > this.displayTop_nCount) {
                            top.shift();
                        }
                        break;
                    }
                }
            }
        }

        for (var i = top.length - 1; i > -1; i--) {
            var rounded = Math.round((top[i].count / this.dataset.length) * 10000) / 100;
            if (rounded.toString().indexOf('.') === -1)
                rounded = rounded.toString() + ".00"
            this.associations.push({
                name: top[i].association,
                value: `${rounded}%`
            });
        }
    }
}
vm = new AppVm();

document.addEventListener("DOMContentLoaded", () => setTimeout(ready, 3500)); // this delay is necessary to prevent the tableau embedding script from interfering with ours