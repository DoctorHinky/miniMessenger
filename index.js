import express from "express";
import WebSocket, { WebSocketServer } from "ws";
import dotenv from "dotenv";
dotenv.config();

import { log, error, warn } from "console";

const app = express();
const PORT = process.env.PORT || 5001;
const server = app.listen(PORT, () => log(`Server is running on port ${PORT}`));

const wss = new WebSocketServer({ server });

let clients = [];
let clientIDS = [];
let lobbyLocked = false;

wss.on("connection", (ws) => {
  log("Neuer Client verbunden");
  if (lobbyLocked) {
    ws.send(
      JSON.stringify({
        type: "LOBBY_LOCKED",
        message: "Lobby ist bereits gesperrt",
      })
    );
    setTimeout(() => {
      ws.close();
    }, 100);
    return;
  }
  const clientId = clients.length === 0 ? "Host" : `Client${clients.length}`;
  clients = clients.filter((client) => client.ws.readyState === WebSocket.OPEN);
  clients.push({ ws, clientId });
  clientIDS.push(clientId);
  log(clientIDS);

  ws.send(
    JSON.stringify({
      type: "WELCOME",
      message: "Erfolgreich verbunden",
      clientId: clientId,
    })
  );

  ws.on("message", (message) => {
    let data;
    try {
      data = JSON.parse(message);
    } catch (err) {
      ws.send(
        JSON.stringify({
          type: "ERROR",
          message: "Ungültige Nachricht",
        })
      );
      error("Ungültige Nachricht", err);
      return;
    }
    log("Data im Backend", data);

    switch (data.type) {
      case "LOCK_LOBBY":
        const locking = data.payload; // es ist das payload Objekt
        if (locking.clientId === "Host") {
          lobbyLocked = true;
        }
        log("locked: ", lobbyLocked);
        log("will locken", locking.clientId);
        break;
      case "UNLOCK_LOBBY":
        const unlocking = data.payload;
        if (unlocking.clientId === "Host") {
          lobbyLocked = false;
        }

        log("LObby locked=: ", lobbyLocked);
        break;

      case "PRIVATE_MESSAGE":
        const client = clients.find(
          (client) => client.clientId === data.clientId
        );
        if (client && client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(
            JSON.stringify({
              type: "PRIVATE_MESSAGE",
              message: data.message,
              clientId: clientId,
            })
          );
        } else {
          ws.send(
            JSON.stringify({
              type: "ERROR",
              message: "Client nicht gefunden",
            })
          );
        }
        break;
      case "NORMAL_MESSAGE":
        const messageData = data.payload;
        log("Normal Message Backend", messageData.message);

        clients
          .filter((client) => client.ws.readyState === WebSocket.OPEN)
          .forEach((client) => {
            client.ws.send(
              JSON.stringify({
                type: "NORMAL_MESSAGE",
                message: messageData.message,
                clientId: clientId,
              })
            );
          });
        log("Normal Message", messageData.message);
        break;

      default:
        ws.send(
          JSON.stringify({
            type: "ERROR",
            message: "Ungültige Nachricht",
          })
        );
        break;
    }
  });

  ws.on("close", () => {
    log(`Client ${clientId} hat die Verbindung getrennt`);

    if (clientId === "Host") {
      clients = clients.filter((client) => client.clientId !== "Host");

      if (clients.length > 0) {
        const openClients = clients.filter(
          (client) => client.ws.readyState === WebSocket.OPEN
        );
        if (openClients.length > 0) {
          openClients[0].clientId = "Host";
          log("Neuer Host", openClients[0].clientId);
          openClients[0].ws.send(
            JSON.stringify({
              type: "NEW_HOST",
              message: "Neuer Host",
              clientId: "Host",
            })
          );
        }
      } else {
        log("Keine Clients, Lobby wird aufgelöst, alle Daten werden gelöscht");
      }
    } else {
      clients = clients.filter((client) => client.clientId !== clientId);
    }
  });
});
