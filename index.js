/*** TPLinkKL130 Z-Way HA module *******************************************

Version: 1.0.0
(c) Mark Blewett, 2021
-----------------------------------------------------------------------------
Author: 
	Mark Blewett 
	
Repository:
	https://github.com/markblewett/zway-TPLinkKL130
	
Description:
	Zway automation module which drives TP Link KL130(B) lights
	Based upon protocol information from https://github.com/matsuyama/tp-link-KL130-Smart-Wi-Fi-Bulb
	and RGB to HSL conversion from https://www.30secondsofcode.org/js/s/rgb-to-hsb
	
Version:
	1.0.0	2021-12-29	Initial release	
******************************************************************************/

// ----------------------------------------------------------------------------
// --- Class definition, inheritance and setup
// ----------------------------------------------------------------------------

function TPLinkKL130 (id, controller) {
	TPLinkKL130.super_.call(this, id, controller);
}

inherits(TPLinkKL130, AutomationModule);

_module = TPLinkKL130;

// ----------------------------------------------------------------------------
// --- Module instance initialized
// ----------------------------------------------------------------------------

TPLinkKL130.prototype.init = function (config) {
	TPLinkKL130.super_.prototype.init.call(this, config);
	
	var self = this;	

	// Convert JSON to an encrypted message
	function encrypt(json) {
		var data = JSON.stringify(json);
		var key = 171;
		var message = "";
		for (var i = 0, len = data.length; i < len; i++) {
				key = key^data.charCodeAt(i);
				message += String.fromCharCode(key);
		}
		return message;
	}

	// Convert encrypted message to JSON
	function decrypt(message) {
		var key = 171;
		var data = "";
		for (var i = 0, len = message.length; i < len; i++) {
			var a = key^message.charCodeAt(i);
			key = message.charCodeAt(i);
			data += String.fromCharCode(a);
		}
		return JSON.parse(data);
	}
	
	// Send JSON to device, and handle optional reply
	function send(address, port, command, handler) {
		var sock = new sockets.udp();
		if (handler != undefined) {
			sock.onrecv = function(data, host, port) {
				var message = String.fromCharCode.apply(null, new Uint8Array(data));
				var json = decrypt(message);
				debugPrint("TPLinkKL130 received " + JSON.stringify(json) + " from " + host + ":" + port);	
				handler(json);
				this.close();
			};
			sock.listen();
		}
		sock.sendto(encrypt(command), address, port);
		debugPrint("TPLinkKL130 sent " + JSON.stringify(command) + " to " + address + ":" + port);
		if (handler == undefined) {
			sock.close();
		}			
	}
	
	// Convert from RBG to HSB
	function rgb2hsb(rgb) {
		r = rgb.red / 255;
		g = rgb.green / 255;
		b = rgb.blue / 255;
		v = Math.max(r, g, b);
		n = v - Math.min(r, g, b);
		h = n === 0 ? 0 : n && v === r ? (g - b) / n : v === g ? 2 + (b - r) / n : 4 + (r - g) / n;
		return {
			h: Math.round(60 * (h < 0 ? h + 6 : h)), 
			s: Math.round(v && (n / v) * 100), 
			b: Math.round(v * 100)
		};
	}

	// Virtual device which allows the user to change the RGB 
	this.vDev = this.controller.devices.create({
		deviceId: "TPLinkKL130_" + this.id,
		defaults: {
			deviceType: 'switchRGBW',
			customIcons: {
			},
			metrics: {
				icon: 'multilevel',
				title: self.getInstanceTitle(),
				color: {
					r: 0,
					g: 0,
					b: 0
				},
				level: 'off'
			},
			probeType: 'switchColor_rgb'
		},
		handler: function(command, args) {	
			switch(command) {
				
				case "on":
					send(self.config.ip, 9999, {
						"smartlife.iot.smartbulb.lightingservice": {
							"transition_light_state": {
								"ignore_default": 1,
								"transition_period": 0,
								"on_off": 1
							}
						}
					});
					self.vDev.set('metrics:level', 'on');
					break
				
				case "off":
					send(self.config.ip, 9999, {
						"smartlife.iot.smartbulb.lightingservice": {
							"transition_light_state": {
								"ignore_default": 1,
								"transition_period": 0,
								"on_off": 0
							}
						}
					});
					self.vDev.set('metrics:level', 'off');
					break;
					
				case "exact":
					var hsb = rgb2hsb(args)
					send(self.config.ip, 9999, {
						"smartlife.iot.smartbulb.lightingservice": {
							"transition_light_state":{
								"ignore_default": 1,
								"transition_period": 0,
								"on_off": 1,
								"hue": hsb.h,
								"saturation": hsb.s,
								"brightness": hsb.b,
								"color_temp": 0
							}
						}
					});
					self.vDev.set('metrics:level', 'on');
					self.vDev.set('metrics:color:r', args.red);
					self.vDev.set('metrics:color:g', args.green);
					self.vDev.set('metrics:color:b', args.blue);
					break;
					
				case "update":
					send(self.config.ip, 9999, {
						"system":{
							"get_sysinfo":{}
						}
					}, function(json) {
						if (typeof json.system.get_sysinfo.light_state.on_off != 'undefined') {
							self.vDev.set('metrics:level', json.system.get_sysinfo.light_state.on_off == 1 ? 'on' : 'off');
						}
					});
					break;
					
				default:
					debugPrint("TPLinkKL130 received unknown command '" + command + "'");
					break;
			}
		},
		moduleId: this.id,
		overlay: {
			deviceType: 'switchRGBW'		
		}
	});
};

TPLinkKL130.prototype.stop = function () {
	if (this.vDev) {
		this.controller.devices.remove(this.vDev.id);
		this.vDev = null;
	}

	TPLinkKL130.super_.prototype.stop.call(this);
};
