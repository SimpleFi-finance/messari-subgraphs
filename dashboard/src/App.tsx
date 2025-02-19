import ProtocolDashboard from "./interfaces/ProtocolDashboard";
import DeploymentsPage from "./deployments/DeploymentsPage";
import { Route, Routes } from "react-router";
import { dashboardVersion, DashboardVersion } from "./common/DashboardVersion";
import IssuesDisplay from "./interfaces/IssuesDisplay";
import { DashboardHeader } from "./graphs/DashboardHeader";
import { useState } from "react";
import DefiLlamaComparsionTab from "./interfaces/DefiLlamaComparisonTab";
import { schemaMapping } from "./utils";
import DeploymentsInDevelopment from "./deployments/DeploymentsInDevelopment";

function App() {
  console.log('RUNNING VERSION ' + dashboardVersion);
  const [protocolsToQuery, setProtocolsToQuery] = useState<{
    [type: string]: { [proto: string]: { [network: string]: string } };
  }>({});

  const getDeployments = () => {
    fetch("https://raw.githubusercontent.com/messari/subgraphs/master/deployment/deployment.json", {
      method: "GET",
      headers: {
        Accept: "*/*",
      },
    })
      .then(function (res) {
        return res.json();
      })
      .then(function (json) {
        setProtocolsToQuery(json);
      })
      .catch((err) => {
        console.log(err);
      });
  };

  const aliasToProtocol: any = {};

  const depoCount: any = { all: { totalCount: 0, prodCount: 0, devCount: 0 } };
  // Construct subgraph endpoints
  const subgraphEndpoints: { [x: string]: any } = {};
  const endpointSlugs: string[] = [];
  const endpointSlugsByType: any = {};
  if (Object.keys(protocolsToQuery)?.length > 0) {
    Object.keys(protocolsToQuery).forEach((protocolName: string) => {
      const protocol: any = protocolsToQuery[protocolName];
      let isDev = false;
      let schemaType = protocol.schema;
      if (schemaMapping[protocol.schema]) {
        schemaType = schemaMapping[protocol.schema];
      }
      if (schemaType) {
        if (!Object.keys(subgraphEndpoints).includes(schemaType)) {
          subgraphEndpoints[schemaType] = {};
        }
        if (!Object.keys(subgraphEndpoints[schemaType]).includes(protocolName)) {
          subgraphEndpoints[schemaType][protocolName] = {};
        }
      }
      Object.values(protocol.deployments).forEach((depoData: any) => {
        if (!depoData?.services) {
          return;
        }
        if (schemaType && (!!depoData["services"]["hosted-service"] || !!depoData["services"]["decentralized-network"])) {
          if (!!subgraphEndpoints[schemaType][protocolName][depoData.network]) {
            const protocolKeyArr = depoData["services"]["hosted-service"]["slug"].split('-');
            const networkKey = protocolKeyArr.pop();
            subgraphEndpoints[schemaType][protocolKeyArr.join('-')] = {};
            subgraphEndpoints[schemaType][protocolKeyArr.join('-')][networkKey] = "https://api.thegraph.com/subgraphs/name/messari/" + depoData["services"]["hosted-service"]["slug"];
          } else {
            subgraphEndpoints[schemaType][protocolName][depoData.network] = "https://api.thegraph.com/subgraphs/name/messari/" + depoData["services"]["hosted-service"]["slug"];
          }
          endpointSlugs.push(depoData["services"]["hosted-service"]["slug"]);
          if (!endpointSlugsByType[schemaType]) {
            endpointSlugsByType[schemaType] = [depoData["services"]["hosted-service"]["slug"]];
          } else {
            endpointSlugsByType[schemaType].push(depoData["services"]["hosted-service"]["slug"]);
          }
          const alias = depoData["services"]["hosted-service"]["slug"]
            ?.split("-")
            ?.join(
              "_"
            );
          aliasToProtocol[alias] = protocol?.protocol;
        }
        if (!depoCount[schemaType]) {
          depoCount[schemaType] = { totalCount: 0, prodCount: 0, devCount: 0 };
        }
        depoCount.all.totalCount += 1;
        depoCount[schemaType].totalCount += 1;
        if (depoData?.status === 'dev') {
          isDev = true;
        }
      })
      if (isDev) {
        depoCount.all.devCount += 1;
        depoCount[schemaType].devCount += 1;
      } else {
        depoCount.all.prodCount += 1;
        depoCount[schemaType].prodCount += 1;
      }
    })
  }

  // Generate indexing queries


  const queryContents = `
  subgraph
  synced
  fatalError {
    message
  }
  chains {
    chainHeadBlock {
      number
    }
    earliestBlock {
      number
    }
    latestBlock {
      number
    }
    lastHealthyBlock {
      number
    }
  }
  entityCount`;

  const indexingStatusQueries: any = {};
  Object.keys(endpointSlugsByType).forEach((protocolType: string) => {
    let fullCurrentQueryArray = ["query {"];
    let fullPendingQueryArray = ["query {"];
    endpointSlugsByType[protocolType].forEach((name: string) => {
      if (fullCurrentQueryArray[fullCurrentQueryArray.length - 1].length > 75000 || fullPendingQueryArray[fullPendingQueryArray.length - 1].length > 75000) {
        return;
      }
      fullCurrentQueryArray[fullCurrentQueryArray.length - 1] += `      
                ${name
          .split("-")
          .join(
            "_"
          )}: indexingStatusForCurrentVersion(subgraphName: "messari/${name}") {
                  ${queryContents}
                }
            `;
      fullPendingQueryArray[fullPendingQueryArray.length - 1] += `      
              ${name
          .split("-")
          .join(
            "_"
          )}_pending: indexingStatusForPendingVersion(subgraphName: "messari/${name}") {
                ${queryContents}
              }
          `;
      if (fullCurrentQueryArray[fullCurrentQueryArray.length - 1].length > 80000) {
        fullCurrentQueryArray[fullCurrentQueryArray.length - 1] += "}";
        fullCurrentQueryArray.push(" query Status {");
      }
      if (fullPendingQueryArray[fullPendingQueryArray.length - 1].length > 80000) {
        fullPendingQueryArray[fullPendingQueryArray.length - 1] += "}";
        fullPendingQueryArray.push(" query Status {");
      }
    });
    fullCurrentQueryArray[fullCurrentQueryArray.length - 1] += "}";
    fullPendingQueryArray[fullPendingQueryArray.length - 1] += "}";

    if (endpointSlugs.length === 0) {
      fullCurrentQueryArray = [`    query {
        indexingStatuses(subgraphs: "") {
          subgraph
        }
      }`];
      fullPendingQueryArray = [`    query {
        indexingStatuses(subgraphs: "") {
          subgraph
        }
      }`];
    }
    indexingStatusQueries[protocolType] = { fullCurrentQueryArray, fullPendingQueryArray };
  })

  return (
    <div>
      <DashboardVersion />
      <Routes>
        <Route path="/">
          <Route index element={<DeploymentsPage getData={() => getDeployments()} protocolsToQuery={protocolsToQuery} subgraphCounts={depoCount} indexingStatusQueries={indexingStatusQueries} endpointSlugs={endpointSlugs} aliasToProtocol={aliasToProtocol} />} />
          <Route
            path="comparison"
            element={<DefiLlamaComparsionTab deploymentJSON={subgraphEndpoints} getData={() => getDeployments()} />}
          />
          <Route path="development-status" element={<DeploymentsInDevelopment protocolsToQuery={protocolsToQuery} getData={() => getDeployments()} />} />
          <Route path="subgraph" element={<ProtocolDashboard />} />
          <Route
            path="*"
            element={
              <>
                <DashboardHeader protocolData={undefined} protocolId="" subgraphToQueryURL="" schemaVersion="" />
                <IssuesDisplay
                  oneLoaded={true}
                  allLoaded={true}
                  issuesArrayProps={[
                    {
                      message: "404: The route entered does not exist.",
                      type: "404",
                      level: "critical",
                      fieldName: "",
                    },
                  ]}
                />
              </>
            }
          />
        </Route>
      </Routes>
    </div>
  );
}

export default App;