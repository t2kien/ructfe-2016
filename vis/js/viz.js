var Viz = function(infoData, startScoreboard) {
	var svgWrapperId = "svg-wrapper";
	var svgId = "svg-viz";
	var NOT_STARTED = "0";
	var PLAYING = "1";
	var SUSPEND = "2";
	var FINISHED = "3";
	var width = 800; // Это базовый размер экрана. Для остальных экранов используем zoom относительно этого размера.
	var height = 600; // TODO: Хороший вариант: 1366x662
	var loopDelayInMs = 1 * 1000; // TODO: 60 * 1000
	var timeForArrowAnimation = 1;
	var tracePortion = 0.2;

	var colorConstants = ["white", "red", "green", "orange", "magenta", "cyan", "yellow", "brown"];

	var info = infoData;
	var scoreboard = startScoreboard;
	var teams = [];
	var teamIdToNum = {};
	var services = [];
	var serviceIdToNum = {};
	var nodes;
	var arrows;
	var lastGradientId = 0;
	var lastArrowId = 0;

    var LOAD_INTERVAL = 10*1000;
    var cur_round = -1;
    var prev_second = -1;
    var pending_events = [];

	(function() {
		for (var fieldName in info.teams) {
			if (info.teams.hasOwnProperty(fieldName)) {
				var id = teams.length;
				teams.push({index: id, id: id, team_id: fieldName, name: info.teams[fieldName], score: 0, place: null, status: 0});
				teamIdToNum[fieldName] = teams.length - 1;
			}
		}
	})();
	(function() {
		for (var fieldName in info.services) {
			if (info.services.hasOwnProperty(fieldName)) {
				var id = services.length;
				services.push({id: id, service_id: fieldName, name: info.services[fieldName], color: colorConstants[id], visible: true});
				serviceIdToNum[fieldName] = services.length - 1;
			}
		}
	})();
	createFilterPanel();
	updateScore();

	var svg = d3.select("#" + svgId);
	var container = svg.append("g").classed("container", true);
	var defs = svg.append("defs");

	var zoom = d3.behavior.zoom().scaleExtent([0.25, 3]).size([width, height]).on("zoom", function () {
		container.attr("transform", "translate(" + d3.event.translate + ")" + " scale(" + d3.event.scale + ")");
	});
	svg.call(zoom);

	var force;
	drawTeams();

	setTimeout(function () {
		loop();
		setInterval(loop, loopDelayInMs);
	}, 0);

    setTimeout(function () {
        load_events();
        setInterval(load_events, LOAD_INTERVAL);
    }, 0);

    function load_events() {
        $.getJSON('./scoreboard').done(function (rv) {
            if (cur_round < 0) { cur_round = rv.round - 1; }
            if (cur_round === rv.round) { return; }
            next_round = rv.round;

            $.getJSON('./events?from=' + cur_round).done(function (rv) {
                for (var i = 0; i < rv.length; ++i) {
                    if (cur_round <= rv[i][0] && rv[i][0] < next_round) {
                        console.log('ADD ', rv[i]);
                        pending_events.push(rv[i]);
                    }
                }
                cur_round = next_round;
            });
        });
    }

	function loop() {
		$.getJSON("./scoreboard").done(function (scoreboardData) {
			scoreboard = scoreboardData;
			updateScore();
		});

		if (scoreboard.status != NOT_STARTED) {
            if (prev_second < 0 && pending_events.length > 0) {
                prev_second = pending_events[0][1] - 1;
            }

            var end = prev_second + loopDelayInMs;
            var next_second = prev_second;
            while (pending_events.length > 0 && pending_events[0][1] < end) {
                var evt = pending_events.shift();
                setTimeout(
                    function (elem) {
                        return function() { showArrow(elem); }
                    }({
                        from: teamIdToNum[evt[3]],
                        to: teamIdToNum[evt[4]],
                        svc: serviceIdToNum[evt[2]]
                    }),
                    evt[1] - prev_second
                );
                next_second = evt[1];
            }

            prev_second = next_second;
		}
	}

	function updateScore() {
		var i, j;
		for (i = 0; i < teams.length; i++) {
			teams[i].score = scoreboard.table[teams[i].team_id];
		}
		var groupsHash = _.groupBy(teams, 'score');
		groupsArray = [];
		for (var groupKey in groupsHash) {
			if (groupsHash.hasOwnProperty(groupKey)) {
				groupsArray.push({'key': parseFloat(groupKey), 'value': groupsHash[groupKey]})
			}
		}
		groupsArray = _.sortBy(groupsArray, 'key').reverse();
		var minPlace = 1;
		for (i = 0; i < groupsArray.length; i++) {
			var teamsInGroup = groupsArray[i].value;
			var maxPlace = minPlace + teamsInGroup.length - 1;
			for (j = 0; j < teamsInGroup.length; j++) {
				if (minPlace === maxPlace)
					teamsInGroup[j].place = minPlace + "";
				else
					teamsInGroup[j].place = minPlace + "-" + maxPlace;
			}
			minPlace = maxPlace + 1;
		}
	}

	function setOptimalZoom() {
		var $svg = $("#" + svgId);
		var realHeight = $svg.height();
		var realWidth = $svg.width();
		var cad = getCetnerAndDelta(teams);
		var size = teams[0].size;
		cad.dx += size * 2;
		cad.dy += size * 2;
		cad.x += size * 0.5;
		cad.y += size * 0.5;
		var scale = Math.min(realWidth / cad.dx, realHeight / cad.dy);
		var translate = [realWidth / 2 - scale * cad.x, realHeight / 2 - scale * cad.y];
		zoom.translate(translate).scale(scale).event(svg);
	}

	function getCetnerAndDelta(nodes) {
		var miny, maxy;
		var minx = miny = Number.MAX_VALUE;
		var maxx = maxy = Number.MIN_VALUE;
		nodes.forEach(function(d) {
			if(d == undefined)
				return;
			minx = Math.min(d.x, minx);
			maxx = Math.max(d.x, maxx);
			miny = Math.min(d.y, miny);
			maxy = Math.max(d.y, maxy);
		});
		var dx = maxx - minx;
		var dy = maxy - miny;
		var x = (maxx + minx ) / 2;
		var y = (maxy + miny) / 2;
		return { x: x, y: y, dx: dx, dy: dy };
	}

	function showArrow(arrow) {
		var service = services[randomInteger(0, services.length - 1)];
		if (!service.visible)
			return;

		var links = container.selectAll(".arrow" + lastArrowId)
			.data([arrow])
			.enter()
			.append("g")
			.attr("class", ".arrow" + lastArrowId);
		lastArrowId++;

		links.each(function () {
			var link = d3.select(this);
			var linkData = link.data()[0];
			var teamFrom = teams[linkData.from];
			var teamTo = teams[linkData.to];
			var fromX = teamFrom.x + teamFrom.size / 2;
			var fromY = teamFrom.y + teamFrom.size / 2;
			var toX = teamTo.x + teamTo.size / 2;
			var toY = teamTo.y + teamTo.size / 2;
			var dx = toX - fromX;
			var dy = toY - fromY;
			var length = Math.sqrt(dx * dx + dy * dy);
			var angle = Math.atan2(dy, dx) * 180 / Math.PI;
			var gradientId = "grad" + lastGradientId;
			var color = service.color;
			lastGradientId++;
			link.append("line")
				.attr("class", "arrow-line")
				.attr("x1", fromX)
				.attr("y1", fromY)
				.attr("x2", fromX + length)
				.attr("y2", fromY + 0.01)
				.attr("stroke-width", "3")
				.attr("stroke-linecap", "round")
				.attr("stroke", "url(#" + gradientId + ")");
			link.attr("transform", "rotate(" + angle + " " + fromX + " " + fromY + ")");
			var rocket = link.append("circle")
				.attr("class", "rocket")
				.attr("r", 15)
				.attr("cx", fromX)
				.attr("cy", fromY)
				.attr("fill", "url(#" + gradientId + "radial" + ")");
			addGradient(gradientId, color);
			addRadialGradient(gradientId + "radial", color);
			setTimeout(function () {
				rocket.attr("style", "transform: translate(" + length + "px)");
			}, 0);
			setTimeout(function () {
				link.remove();
				defs.select("#" + gradientId).remove();
				defs.select("#" + gradientId + "radial").remove();
			}, timeForArrowAnimation * 1000 * (1 + tracePortion));
			setTimeout(function () {
				rocket.remove();
				defs.select("#" + gradientId + "radial").remove();
			}, timeForArrowAnimation * 1000 * (1 + tracePortion / 2));
		});
	}

	function drawTeams() {
		var columnsCount;
		var rowsCount;
		var islandSquareSide;
		var spaceBetweenIslands = 10;

		setIslandSize(teams.length);

		nodes = container.selectAll(".node")
			.data(teams)
			.enter()
			.append("g")
			.attr("class", "node");

		nodes.each(function () {
			var node = d3.select(this);
			var nodeData = node.data()[0];
			nodeData.size = islandSquareSide - spaceBetweenIslands;
			nodeData.width = nodeData.size + 10;
			nodeData.height = nodeData.size + 10;
			node.append("rect")
				.classed("island", true)
				.attr("width", nodeData.size)
				.attr("height", nodeData.size);
		});

		force = d3.layout.force()
			.gravity(0.05)
			.charge(function(d, i) {
				return i < 2 ? -15000 : -40;
			})
			.nodes([{x: width / 2, y: -1000, width: 0, height: 0, fixed: true}, {x: width / 2, y: height + 1000, width: 0, height: 0, fixed: true}].concat(teams))
			.size([width, height])
			.on("tick", tick);
		force.start();
		startTicks();

		function setIslandSize(teamsCount) {
			islandSquareSide = 10;
			while (Math.floor(width / (islandSquareSide + 1)) * Math.floor(height / (islandSquareSide + 1)) > teamsCount)
				islandSquareSide++;
			columnsCount = Math.floor(width / islandSquareSide);
			rowsCount = Math.floor(height / islandSquareSide);
		}
	}

	function tick() {
		var q = d3.geom.quadtree(teams),
			i = 0,
			n = teams.length;

		while (++i < n) {
			q.visit(collide(teams[i]));
		}
	}

	function collide(node) {
		return function(quad, x1, y1, x2, y2) {
			var updated = false;
			if (quad.point && (quad.point !== node)) {

				var x = node.x - quad.point.x,
					y = node.y - quad.point.y,
					xSpacing = (quad.point.width + node.width) / 2,
					ySpacing = (quad.point.height + node.height) / 2,
					absX = Math.abs(x),
					absY = Math.abs(y),
					l,
					lx,
					ly;

				if (absX < xSpacing && absY < ySpacing) {
					l = Math.sqrt(x * x + y * y);

					lx = (absX - xSpacing) / l;
					ly = (absY - ySpacing) / l;

					if (Math.abs(lx) > Math.abs(ly)) {
						lx = 0;
					} else {
						ly = 0;
					}

					node.x -= x *= lx;
					node.y -= y *= ly;
					quad.point.x += x;
					quad.point.y += y;

					updated = true;
				}
			}
			return updated;
		};
	}

	function startTicks() {
		force.tick();
		if(force.alpha() > 0.015) {
			startTicks();
		} else {
			force.stop();
			updatePicture();
		}
	}

	function updatePicture() {
		svg.selectAll('.island')
			.attr('x', function(d) { return d.x; })
			.attr('y', function(d) { return d.y; });
		setOptimalZoom();
	}

	function randomInteger(min, max) {
		var rand = min + Math.random() * (max - min);
		rand = Math.round(rand);
		return rand;
	}

	$(window).resize(function () {
		setOptimalZoom();
	});

	$("#" + svgWrapperId).tooltip({
		items: ".node",
		track: true,
		show: { effect: "fadeIn", delay: 100, duration: 80 },
		hide: { effect: "fadeOut", delay: 50, duration: 40 },
		content: function() {
			var node = d3.select(this);
			var nodeData = node.data()[0];
			var html = "<span><span class='header'>Team name:</span> <span class='value'>" + nodeData.name + "</span></span><br/>"
				+ "<span><span class='header'>Place:</span> <span class='value'>" + nodeData.place + "</span></span><br/>"
				+ "<span><span class='header'>Score:</span> <span class='value'>" + nodeData.score + "</span></span>";
			return "<div class='team-tooltip'>" + html + "</div>";
		},
	});
	$(".ui-helper-hidden-accessible").remove();

	function createFilterPanel() {
		var deselectionFlag = "deselected";
		var $fc = $("#filters-container");

		for (var i=0; i<services.length; i++) {
			var service = services[i];
			var $filter = $('<div class="filter">' + service.name + '</div>');
			$filter.css("color", service.color);
			$filter.click( function(index) {return function () {
				if ($(this).hasClass(deselectionFlag)) {
					$(this).removeClass(deselectionFlag);
					services[index].visible = true;
				} else {
					$(this).addClass(deselectionFlag);
					services[index].visible = false;
				}
			}
			}(i));
			$fc.append($filter);
		}
	}

	function addRadialGradient(id, color) {
		var gradient = defs.append("radialGradient").attr("id", id);
		gradient.append("stop")
			.attr("offset", 0)
			.attr("stop-color", color)
			.attr("stop-opacity", 1);
		gradient.append("stop")
			.attr("offset", 0.5)
			.attr("stop-color", color)
			.attr("stop-opacity", 0.2);
		gradient.append("stop")
			.attr("offset", 1)
			.attr("stop-color", color)
			.attr("stop-opacity", 0);
	}

	function addGradient(id, color) {
		var startTime = svg[0][0].getCurrentTime();
		var gradient = defs.append("linearGradient").attr("id", id);
		var traceTime = timeForArrowAnimation * tracePortion;
		var allTime = timeForArrowAnimation + traceTime;

		gradient.append("stop")
			.attr("offset", 0)
			.attr("stop-color", color)
			.attr("stop-opacity", 0);
		var stop2 = gradient.append("stop")
			.attr("offset", 0)
			.attr("stop-color", color)
			.attr("stop-opacity", 1);
		stop2.append("animate")
			.attr("attributeName", "stop-opacity")
			.attr("begin", startTime)
			.attr("dur", traceTime)
			.attr("values", "1;0")
			.attr("repeatCount", 1)
			.attr("fill", "freeze");
		stop2.append("animate")
			.attr("attributeName", "offset")
			.attr("begin", startTime + traceTime)
			.attr("dur", allTime - traceTime)
			.attr("values", "0;" + (1 - tracePortion))
			.attr("repeatCount", 1)
			.attr("fill", "freeze");
		stop2.append("animate")
			.attr("attributeName", "stop-opacity")
			.attr("begin", startTime + allTime)
			.attr("dur", "0.001s")
			.attr("values", "0;1")
			.attr("repeatCount", 1)
			.attr("fill", "freeze");
		stop2.append("animate")
			.attr("attributeName", "offset")
			.attr("begin", startTime + allTime)
			.attr("dur", "0.001s")
			.attr("values", (1 - tracePortion) + ";0")
			.attr("repeatCount", 1)
			.attr("fill", "freeze");
		var stop3 = gradient.append("stop")
			.attr("offset", 0)
			.attr("stop-color", color)
			.attr("stop-opacity", 1);
		stop3.append("animate")
			.attr("attributeName", "offset")
			.attr("begin", startTime)
			.attr("dur", allTime - traceTime)
			.attr("values", "0;1")
			.attr("repeatCount", 1)
			.attr("fill", "freeze");
		stop3.append("animate")
			.attr("attributeName", "stop-opacity")
			.attr("begin", startTime + allTime - traceTime)
			.attr("dur", traceTime)
			.attr("values", "1;0")
			.attr("repeatCount", 1)
			.attr("fill", "freeze");
		stop3.append("animate")
			.attr("attributeName", "offset")
			.attr("begin", startTime + allTime)
			.attr("dur", "0.001s")
			.attr("values", "1;0")
			.attr("repeatCount", 1)
			.attr("fill", "freeze");
		stop3.append("animate")
			.attr("attributeName", "stop-opacity")
			.attr("begin", startTime + allTime)
			.attr("dur", "0.001s")
			.attr("values", "0;1")
			.attr("repeatCount", 1)
			.attr("fill", "freeze");
		var stop4 = gradient.append("stop")
			.attr("offset", 0)
			.attr("stop-color", color)
			.attr("stop-opacity", 0);
		stop4.append("animate")
			.attr("attributeName", "offset")
			.attr("begin", startTime)
			.attr("dur", allTime - traceTime)
			.attr("values", "0;1")
			.attr("repeatCount", 1)
			.attr("fill", "freeze");
		stop4.append("animate")
			.attr("attributeName", "stop-opacity")
			.attr("begin", startTime + allTime - traceTime)
			.attr("dur", traceTime)
			.attr("values", "1;0")
			.attr("repeatCount", 1)
			.attr("fill", "freeze");
		stop4.append("animate")
			.attr("attributeName", "offset")
			.attr("begin", startTime + allTime)
			.attr("dur", "0.001s")
			.attr("values", "1;0")
			.attr("repeatCount", 1)
			.attr("fill", "freeze");
		stop4.append("animate")
			.attr("attributeName", "stop-opacity")
			.attr("begin", startTime + allTime)
			.attr("dur", "0.001s")
			.attr("values", "1;0")
			.attr("repeatCount", 1)
			.attr("fill", "freeze");
		gradient.append("stop")
			.attr("offset", 1)
			.attr("stop-color", color)
			.attr("stop-opacity", 0);
	}

	return {
		getTeamsData: function() { return teams; },
		getInfo: function() { return info; },
		getScoreboard: function() { return scoreboard; }
	}
};