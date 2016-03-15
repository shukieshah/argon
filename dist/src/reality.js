System.register(['aurelia-dependency-injection', './cesium/cesium-imports', './timer', './config', './focus', './session', './camera', './device', './utils', './viewport'], function(exports_1, context_1) {
    "use strict";
    var __moduleName = context_1 && context_1.id;
    var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
        var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
        if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
        else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
        return c > 3 && r && Object.defineProperty(target, key, r), r;
    };
    var aurelia_dependency_injection_1, cesium_imports_1, timer_1, config_1, focus_1, session_1, camera_1, device_1, utils_1, viewport_1;
    var RealitySetupHandler, RealityService, EmptyRealitySetupHandler;
    return {
        setters:[
            function (aurelia_dependency_injection_1_1) {
                aurelia_dependency_injection_1 = aurelia_dependency_injection_1_1;
            },
            function (cesium_imports_1_1) {
                cesium_imports_1 = cesium_imports_1_1;
            },
            function (timer_1_1) {
                timer_1 = timer_1_1;
            },
            function (config_1_1) {
                config_1 = config_1_1;
            },
            function (focus_1_1) {
                focus_1 = focus_1_1;
            },
            function (session_1_1) {
                session_1 = session_1_1;
            },
            function (camera_1_1) {
                camera_1 = camera_1_1;
            },
            function (device_1_1) {
                device_1 = device_1_1;
            },
            function (utils_1_1) {
                utils_1 = utils_1_1;
            },
            function (viewport_1_1) {
                viewport_1 = viewport_1_1;
            }],
        execute: function() {
            RealitySetupHandler = (function () {
                function RealitySetupHandler() {
                }
                return RealitySetupHandler;
            }());
            exports_1("RealitySetupHandler", RealitySetupHandler);
            /**
            * Manages reality
            */
            RealityService = (function () {
                function RealityService(handlers, sessionService, cameraService, deviceService, focusService, viewportService) {
                    var _this = this;
                    this.handlers = handlers;
                    this.sessionService = sessionService;
                    this.cameraService = cameraService;
                    this.deviceService = deviceService;
                    this.focusService = focusService;
                    this.viewportService = viewportService;
                    /**
                     * The current reality.
                     */
                    this.current = null;
                    /**
                     * The desired reality.
                     */
                    this.desired = null;
                    /**
                     * An event that is raised when a reality control port is opened.
                     */
                    this.connectEvent = new utils_1.Event();
                    /**
                     * An event that is raised when the current reality is changed.
                     */
                    this.changeEvent = new utils_1.Event();
                    /**
                     * An event that is raised when the current reality emits the next frame state.
                     * This event contains pose updates for the entities that are managed by
                     * the current reality.
                     */
                    this.frameEvent = new utils_1.Event();
                    /**
                     * Manager-only. A map from a managed session to the desired reality
                     */
                    this.desiredRealityMap = new WeakMap();
                    /**
                     * Manager-only. A map from a desired reality to the session which requested it
                     */
                    this.desiredRealityMapInverse = new WeakMap();
                    if (sessionService.isManager()) {
                        sessionService.connectEvent.addEventListener(function (session) {
                            session.closeEvent.addEventListener(function () {
                                if (_this._realitySession === session) {
                                    _this._realitySession = null;
                                }
                            });
                            session.on['ar.reality.desired'] = function (message, event) {
                                var reality = message.reality;
                                console.log('Session set desired reality: ' + JSON.stringify(reality));
                                if (reality) {
                                    if (_this.isSupported(reality.type)) {
                                        _this.desiredRealityMap.set(session, reality);
                                        _this.desiredRealityMapInverse.set(reality, session);
                                    }
                                    else {
                                        session.sendError({ message: 'reality type "' + reality.type + '" is not suppored on this platform' });
                                    }
                                }
                                else {
                                    _this.desiredRealityMap.delete(session);
                                }
                                _this._setNextReality(_this.onSelectReality());
                            };
                            session.on['ar.reality.message'] = function (message) {
                                if (_this.desiredRealityMapInverse.get(_this.current) === session) {
                                    _this._realitySession.send('ar.reality.message', message);
                                }
                            };
                        });
                        sessionService.manager.connectEvent.addEventListener(function () {
                            setTimeout(function () {
                                if (!_this.desired)
                                    _this._setNextReality(_this.onSelectReality());
                            });
                        });
                    }
                    sessionService.manager.on['ar.reality.connect'] = function () {
                        var messageChannel = _this.sessionService.createMessageChannel();
                        var realityControlSession = _this.sessionService.createSessionPort();
                        messageChannel.port1.onmessage = function (msg) {
                            _this.sessionService.manager.send('ar.reality.message', msg.data);
                        };
                        _this.sessionService.manager.on['ar.reality.message'] = function (message) {
                            messageChannel.port1.postMessage(message);
                        };
                        realityControlSession.connectEvent.addEventListener(function () {
                            _this.connectEvent.raiseEvent(realityControlSession);
                        });
                        _this.sessionService.manager.closeEvent.addEventListener(function () {
                            realityControlSession.close();
                        });
                        realityControlSession.open(messageChannel.port2, _this.sessionService.configuration);
                    };
                }
                /**
                * Manager-only. Check if a type of reality is supported.
                * @param type reality type
                * @return true if a handler exists and false otherwise
                */
                RealityService.prototype.isSupported = function (type) {
                    this.sessionService.ensureIsManager();
                    return !!this._getHandler(type);
                };
                /**
                 * Set the desired reality.
                 */
                RealityService.prototype.setDesired = function (reality) {
                    if (reality && !reality['id'])
                        reality['id'] = cesium_imports_1.createGuid();
                    this.desired = reality;
                    this.sessionService.manager.send('ar.reality.desired', { reality: reality });
                };
                /**
                * Manager-only. Selects the best reality based on the realites
                * requested by all managed sessions. Can be overriden for customized selection.
                *
                * @returns The reality chosen for this context. May be undefined if no
                * realities have been requested.
                */
                RealityService.prototype.onSelectReality = function () {
                    this.sessionService.ensureIsManager();
                    var selectedReality = this.desiredRealityMap.get(this.sessionService.manager);
                    if (!selectedReality) {
                        selectedReality = this.desiredRealityMap.get(this.focusService.currentSession);
                    }
                    if (!selectedReality) {
                        // TODO: sort and select based on some kind of ranking system
                        for (var _i = 0, _a = this.sessionService.managedSessions; _i < _a.length; _i++) {
                            var session = _a[_i];
                            var desiredReality = this.desiredRealityMap.get(session);
                            if (desiredReality && this.isSupported(desiredReality.type)) {
                                selectedReality = desiredReality;
                                break;
                            }
                        }
                    }
                    return selectedReality;
                };
                RealityService.prototype._setNextReality = function (reality) {
                    var _this = this;
                    console.log('Setting reality: ' + JSON.stringify(reality));
                    if (this.current && reality && this.current.id === reality.id)
                        return;
                    if (this.current && !reality)
                        return;
                    if (!this.current && !reality) {
                        reality = this.sessionService.configuration.defaultReality;
                        if (!reality)
                            return;
                        reality.id = 'default';
                    }
                    var realitySession = this.sessionService.addManagedSessionPort();
                    realitySession.on['ar.reality.frameState'] = function (state) {
                        var frameState = {
                            reality: reality,
                            frameNumber: state.frameNumber,
                            time: state.time,
                            viewport: state.viewport || _this.viewportService.getSuggested(),
                            camera: state.camera || _this.cameraService.getSuggested(),
                            entities: state.entities || {}
                        };
                        if (!cesium_imports_1.defined(frameState.entities['DEVICE'])) {
                            frameState.entities['DEVICE'] = _this.deviceService.getPose(frameState.time);
                        }
                        if (!cesium_imports_1.defined(frameState.entities['EYE'])) {
                            frameState.entities['EYE'] = _this.deviceService.getEyePose(frameState.time);
                        }
                        _this.frameEvent.raiseEvent(frameState);
                    };
                    realitySession.on['ar.reality.message'] = function (message) {
                        var owner = _this.desiredRealityMapInverse.get(reality) || _this.sessionService.manager;
                        owner.send('ar.reality.message', message);
                    };
                    realitySession.connectEvent.addEventListener(function () {
                        var previousRealitySession = _this._realitySession;
                        var previousReality = _this.current;
                        _this._realitySession = realitySession;
                        _this._setCurrent(reality);
                        if (previousRealitySession) {
                            previousRealitySession.close();
                        }
                        if (realitySession.info.role !== config_1.Role.REALITY) {
                            realitySession.sendError({ message: "Expected a reality session" });
                            realitySession.close();
                            return;
                        }
                        if (realitySession.info.enableRealityControlPort) {
                            var ownerSession = _this.desiredRealityMapInverse.get(reality) || _this.sessionService.manager;
                            var channel = _this.sessionService.createMessageChannel();
                            realitySession.send('ar.reality.connect');
                            ownerSession.send('ar.reality.connect');
                        }
                    });
                    realitySession.closeEvent.addEventListener(function () {
                        console.log('Reality session closed: ' + JSON.stringify(reality));
                        _this._setNextReality(_this.onSelectReality());
                    });
                    var messageChannel = this.sessionService.createMessageChannel();
                    realitySession.open(messageChannel.port1, this.sessionService.configuration);
                    this._executeRealitySetupHandler(reality, messageChannel.port2);
                };
                RealityService.prototype._getHandler = function (type) {
                    var found = undefined;
                    for (var _i = 0, _a = this.handlers; _i < _a.length; _i++) {
                        var handler = _a[_i];
                        if (handler.type === type) {
                            found = handler;
                            break;
                        }
                    }
                    return found;
                };
                RealityService.prototype._setCurrent = function (reality) {
                    if (!this.current || this.current.id !== reality.id) {
                        var previous = this.current;
                        this.current = reality;
                        this.changeEvent.raiseEvent({ previous: previous });
                        console.log('Reality changed to: ' + JSON.stringify(reality));
                    }
                };
                RealityService.prototype._executeRealitySetupHandler = function (reality, port) {
                    this.sessionService.ensureIsManager();
                    var handler = this._getHandler(reality.type);
                    if (!handler)
                        throw new Error('Unable to setup unsupported reality type: ' + reality.type);
                    handler.setup(reality, port);
                };
                RealityService = __decorate([
                    aurelia_dependency_injection_1.inject(aurelia_dependency_injection_1.All.of(RealitySetupHandler), session_1.SessionService, camera_1.CameraService, device_1.DeviceService, focus_1.FocusService, viewport_1.ViewportService, timer_1.TimerService)
                ], RealityService);
                return RealityService;
            }());
            exports_1("RealityService", RealityService);
            EmptyRealitySetupHandler = (function () {
                function EmptyRealitySetupHandler(sessionService, timer) {
                    this.sessionService = sessionService;
                    this.timer = timer;
                    this.type = 'empty';
                }
                EmptyRealitySetupHandler.prototype.setup = function (reality, port) {
                    var _this = this;
                    var remoteRealitySession = this.sessionService.createSessionPort();
                    var doUpdate = true;
                    remoteRealitySession.connectEvent.addEventListener(function () {
                        var update = function (time, frameNumber) {
                            if (doUpdate) {
                                var frameState = {
                                    time: time,
                                    frameNumber: frameNumber
                                };
                                remoteRealitySession.send('ar.reality.frameState', frameState);
                                _this.timer.requestFrame(update);
                            }
                        };
                        _this.timer.requestFrame(update);
                    });
                    remoteRealitySession.closeEvent.addEventListener(function () {
                        doUpdate = false;
                    });
                    remoteRealitySession.open(port, { role: config_1.Role.REALITY });
                };
                EmptyRealitySetupHandler = __decorate([
                    aurelia_dependency_injection_1.inject(session_1.SessionService, timer_1.TimerService)
                ], EmptyRealitySetupHandler);
                return EmptyRealitySetupHandler;
            }());
            exports_1("EmptyRealitySetupHandler", EmptyRealitySetupHandler);
        }
    }
});
