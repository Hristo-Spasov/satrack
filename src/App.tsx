import {
  Viewer,
  ImageryLayer,
  CesiumComponentRef,
  SkyBox,
  Entity,
} from "resium";
import {
  ArcGisMapServerImageryProvider,
  Cartesian2,
  Cartesian3,
  Color,
  HorizontalOrigin,
  Ion,
  UrlTemplateImageryProvider,
  VerticalOrigin,
  JulianDate,
  SampledPositionProperty,
  ClockRange,
} from "cesium";
import { Viewer as CesiumViewer } from "cesium";
import "./App.css";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  twoline2satrec,
  propagate,
  eciToGeodetic,
  degreesLong,
  degreesLat,
  gstime,
} from "satellite.js";
import positiveX from "./assets/cubemap/skybox/top.png";
import negativeX from "./assets/cubemap/skybox/bottom.png";
import positiveY from "./assets/cubemap/skybox/left.png";
import negativeY from "./assets/cubemap/skybox/right.png";
import positiveZ from "./assets/cubemap/skybox/front.png";
import negativeZ from "./assets/cubemap/skybox/back.png";
import { useQuery } from "@tanstack/react-query";
import axios, { AxiosError } from "axios";

const esri = await ArcGisMapServerImageryProvider.fromUrl(
  "https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/"
);
const hybridImageryProvider = new UrlTemplateImageryProvider({
  url: "https://cartodb-basemaps-a.global.ssl.fastly.net/rastertiles/voyager_only_labels/{z}/{x}/{y}.png",
});

interface TleData {
  name: string;
  line1: string;
  line2: string;
}

interface SatelliteEntity {
  name: string;
  position: SampledPositionProperty;
}

function App() {
  Ion.defaultAccessToken = "";
  const viewerRef = useRef<CesiumComponentRef<CesiumViewer>>(null);
  const [fps, setFps] = useState<number>(0);
  const [satelliteEntities, setSatelliteEntities] = useState<SatelliteEntity[]>(
    []
  );
  const start = JulianDate.fromDate(new Date());
  // const stop = JulianDate.addMinutes(start, 5, new JulianDate());

  // Set up FPS calculation
  useEffect(() => {
    if (document.visibilityState === "hidden") return;
    let frameCount = 0;
    let lastFpsUpdate = performance.now();
    let animationFrameId: number;

    const calculateFps = () => {
      const now = performance.now();
      frameCount++;

      if (now - lastFpsUpdate >= 1000) {
        const fps = (frameCount * 1000) / (now - lastFpsUpdate);
        setFps(Math.round(fps));
        lastFpsUpdate = now;
        frameCount = 0;
      }

      animationFrameId = requestAnimationFrame(calculateFps);
    };

    // Start calculating FPS
    animationFrameId = requestAnimationFrame(calculateFps);

    return () => {
      // Cancel animation frame when component unmounts
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  const fetchTleData = async (): Promise<TleData[]> => {
    const url =
      "https://satrack-server-uwppc.ondigitalocean.app/api/v1/satellites/limit";

    try {
      const response = await axios.get(url);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const axiosError: AxiosError = error;
        console.log("error message: ", error.message);
        throw axiosError;
      } else {
        console.log("unexpected error: ", error);
        throw new Error("An unexpected error occurred");
      }
    }
  };

  const { data: tleData } = useQuery({
    queryKey: ["tleData"],
    queryFn: () => fetchTleData(),
    staleTime: 3 * 60 * 60 * 1000,
  });

  const calculateSatellitePositions = () => {
    if (!tleData) return;
    const entities: SatelliteEntity[] = tleData.map(
      ({ name, line1, line2 }) => {
        const satrec = twoline2satrec(line1, line2);
        const positionProperty = new SampledPositionProperty();

        // Calculate positions for next 60 seconds with 1-second intervals
        for (let i = 0; i < 4; i++) {
          const time = JulianDate.addHours(start, i, new JulianDate());
          const jsDate = JulianDate.toDate(time);

          const positionAndVelocity = propagate(satrec, jsDate);
          const positionEci = positionAndVelocity.position;

          if (positionEci && typeof positionEci === "object") {
            const gmst = gstime(jsDate);
            const positionGd = eciToGeodetic(positionEci, gmst);
            const position = Cartesian3.fromDegrees(
              degreesLong(positionGd.longitude),
              degreesLat(positionGd.latitude),
              positionGd.height * 1000
            );

            positionProperty.addSample(time, position);
          }
        }

        return {
          name,
          position: positionProperty,
        };
      }
    );

    setSatelliteEntities(entities);
  };

  useEffect(() => {
    if (!viewerRef.current?.cesiumElement) return;

    const viewer = viewerRef.current.cesiumElement;
    viewer.clock.startTime = start.clone();
    viewer.clock.currentTime = start.clone();
    viewer.clock.clockRange = ClockRange.UNBOUNDED;
    viewer.clock.multiplier = 1;
    viewer.clock.shouldAnimate = true;

    calculateSatellitePositions();
  }, [tleData]);

  const skyboxSources = useMemo(
    () => ({
      positiveX: positiveX,
      negativeX: negativeX,
      positiveY: positiveY,
      negativeY: negativeY,
      positiveZ: positiveZ,
      negativeZ: negativeZ,
    }),
    []
  );

  return (
    <Viewer
      full
      ref={viewerRef}
      sceneModePicker={false}
      timeline={false}
      baseLayer={false}
      animation={false}
      navigationHelpButton={false}
      homeButton={false}
      geocoder={false}
      fullscreenButton={false}
      vrButton={false}
      infoBox={false}
      selectionIndicator={false}
      baseLayerPicker={false}
      shouldAnimate={true} //makes the clock animate even if the tab is not open
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          padding: "10px",
          backgroundColor: "rgba(0, 0, 0, 0.7)",
          color: "white",
          fontSize: "16px",
        }}
      >
        FPS: {fps}
      </div>
      <SkyBox sources={skyboxSources} />

      <ImageryLayer imageryProvider={esri} />
      <ImageryLayer imageryProvider={hybridImageryProvider} />
      {satelliteEntities.map((satEntity, index) => (
        <Entity
          key={index}
          position={satEntity.position}
          point={{
            pixelSize: 5,
            color: Color.RED,
            outlineColor: Color.WHITE,
            outlineWidth: 2,
          }}
          label={{
            text: satEntity.name,
            font: "32px sans-serif",
            fillColor: Color.WHITE,
            outlineColor: Color.BLACK,
            outlineWidth: 2,
            pixelOffset: new Cartesian2(0, 20),
            horizontalOrigin: HorizontalOrigin.CENTER,
            verticalOrigin: VerticalOrigin.CENTER,
            scale: 0.5,
          }}
        />
      ))}
    </Viewer>
  );
}
export default App;
