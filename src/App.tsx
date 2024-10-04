import {
  Viewer,
  ImageryLayer,
  CesiumComponentRef,
  Entity,
  SkyBox,
} from "resium";
import {
  ArcGisMapServerImageryProvider,
  Cartesian2,
  Cartesian3,
  Color,
  Ion,
  UrlTemplateImageryProvider,
} from "cesium";
import { Viewer as CesiumViewer } from "cesium";
import "./App.css";
import { useEffect, useRef, useState } from "react";
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

Ion.defaultAccessToken = null;
const esri = await ArcGisMapServerImageryProvider.fromUrl(
  "https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/"
);
const hybridImageryProvider = new UrlTemplateImageryProvider({
  url: "https://cartodb-basemaps-a.global.ssl.fastly.net/rastertiles/voyager_only_labels/{z}/{x}/{y}.png",
});

interface Satellite {
  name: string;
  position: {
    longitude: number;
    latitude: number;
    altitude: number;
  };
}
interface TleData {
  name: string;
  line1: string;
  line2: string;
}

function App() {
  const viewerRef = useRef<CesiumComponentRef<CesiumViewer>>(null);
  const [satellites, setSatellites] = useState<Satellite[]>([]);
  const [tleData, setTleData] = useState<TleData[]>([]);

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

  const { data: cachedTleData, status: tleDataStatus } = useQuery({
    queryKey: ["tleData"],
    queryFn: fetchTleData,
  });

  useEffect(() => {
    if (tleDataStatus === "success") setTleData(cachedTleData);
  }, [cachedTleData, tleDataStatus]);

  const calculateSatellitePositions = () => {
    const updatedSatellites: Satellite[] = tleData
      .map(({ name, line1, line2 }) => {
        const satrec = twoline2satrec(line1, line2);
        const positionAndVelocity = propagate(satrec, new Date());
        const positionEci = positionAndVelocity.position;

        if (positionEci && typeof positionEci === "object") {
          const gmst = gstime(new Date());
          const positionGd = eciToGeodetic(positionEci, gmst);
          const longitude = degreesLong(positionGd.longitude);
          const latitude = degreesLat(positionGd.latitude);
          const altitude = positionGd.height * 1000; // Convert km to meters

          return {
            name,
            position: {
              longitude,
              latitude,
              altitude,
            },
          };
        } else {
          console.error("Something is wrong with the data");
          return null;
        }
      })
      .filter((satellite): satellite is Satellite => satellite !== null);

    setSatellites(updatedSatellites);
  };

  // Update positions every second using the latest fetched TLE data
  useEffect(() => {
    const positionInterval = setInterval(calculateSatellitePositions, 100); // Update every 1 second

    return () => clearInterval(positionInterval); // Cleanup on unmount
  }); // Run whenever tleData changes

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
    >
      <SkyBox
        sources={{
          positiveX: positiveX,
          negativeX: negativeX,
          positiveY: positiveY,
          negativeY: negativeY,
          positiveZ: positiveZ,
          negativeZ: negativeZ,
        }}
      />

      <ImageryLayer imageryProvider={esri} />
      <ImageryLayer imageryProvider={hybridImageryProvider} />
      {satellites.map((satellite, index) => (
        <Entity
          key={index}
          name={satellite.name}
          position={Cartesian3.fromDegrees(
            satellite.position.longitude,
            satellite.position.latitude,
            satellite.position.altitude
          )}
          point={{
            pixelSize: 5,
            color: Color.RED,
            outlineColor: Color.WHITE,
            outlineWidth: 2,
          }}
          label={{
            text: satellite.name,
            font: "14pt sans-serif",
            fillColor: Color.WHITE,
            outlineColor: Color.BLACK,
            outlineWidth: 1,
            pixelOffset: new Cartesian2(0, -10),
          }}
        />
      ))}
    </Viewer>
  );
}

export default App;
