// // dependencies
const express = require("express");
// const http = require("http");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const morgan = require("morgan");
const socketIo = require("socket.io");
const https = require("https");
// const fs = require("fs");

// env variables
const PORT = 4000;

// initialize instance of express, http, ws, peerserver
const app = express();
const httpsServer = https.createServer(app);
const io = socketIo(httpsServer);

// middleware
app.use(express.json());
app.use(morgan(":method :url :status"));

const corsOptions = {
    origin: ["*", "http://localhost:3000"],
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    preflightContinue: false,
    optionsSuccessStatus: 204,
};
app.use(cors(corsOptions));

// routes
// unprotected get route
app.get("/", (req, res) => {
    res.json({
        message: "API is working",
    });
});

// protected post route
app.post("/api/mydevices", verifyToken, (req, res) => {
    jwt.verify(req.token, "some_secret_key", (err, authData) => {
        if (err) {
            res.sendStatus(403);
        } else {
            res.json({
                message: "My devices... ",
                authData,
            });
        }
    });
});

// login route to generate a jwt token
app.post("/api/login", (req, res) => {
    // mock user
    const user = {
        id: 1,
        username: "asd0999",
    };

    // generate token asynchronously, using a callback
    jwt.sign({ user: user }, // data for creating the token
        "some_secret_key", { expiresIn: "30s" },
        (err, token) => {
            // console.log(user, token);
            res.json({
                token: token,
            });
        }
    );
});

// FORMAT OF TOKEN
// Authorization: Bearer <access_token>

// verify token before giving access to the protected route
function verifyToken(req, res, next) {
    const bearerHeader = req.headers["authorization"];
    // console.log(bearerHeader);
    if (typeof bearerHeader !== "undefined") {
        // extract token from bearer
        const bearerToken = bearerHeader.split(" ")[1];
        req.token = bearerToken;
        next();
    } else {
        res.sendStatus(403); //forbidden
    }
}

// OTP
const generateOTP = () => {
    return Math.floor((1 + Math.random()) * 100000);
};

// SOCKET CONNECTION
let clients = {};

io.on("connection", function(socket) {
    console.log("Client connected:", socket.id);
    clients[socket.id] = {};
    console.log(clients);

    socket.on("clienthello", () => {
        // console.log("clienthello received");
        socket.emit("serverack", socket.id);
    });

    // sender requests an OTP for authentication/pairing with receiver
    socket.on("OTPrequest", () => {
        console.log("otp request recd");
        const otp = generateOTP();
        if (clients[socket.id]) {
            clients[socket.id]["otp"] = otp;
        }
        console.log("sending otp:", otp);
        socket.emit("otp", otp);
        console.log(clients);
    });

    // receiver makes a request to pari with sender after entering the OTP
    socket.on("pairingRequest", (otp) => {
        console.log("otp received:", otp);
        console.log("from socket id:", socket.id);
        if (clients[socket.id]) {
            clients[socket.id]["otp"] = otp;
        }

        for (const socket_id of Object.keys(clients)) {
            if (socket_id == socket.id) {
                continue;
            }
            if (clients[socket_id]["otp"] == clients[socket.id]["otp"]) {
                console.log("Found matching otp. Pairing complete:");
                console.log("sender:", socket_id, "\nreceiver:", socket.id);
                //receiver send peer_socket_id
                clients[socket.id]["peer_socket_id"] = socket_id;
                socket.emit("peerSocketId", socket_id);
                clients[socket.id]["otp"] += "_matched";

                //sender send peer_socket_id
                clients[socket_id]["peer_socket_id"] = socket.id;
                io.to(socket_id).emit("peerSocketId", socket.id);
                clients[socket_id]["otp"] += "_matched";
            }
        }
        console.log(clients);
    });

    // //received from receiver upon making data connection
    // socket.on("peerConnected", () => {
    //     //sending ack to sender that data connection has been established
    //     io.to(clients[socket.id]["peer_socket_id"]).emit("peerConnected");
    // });

    socket.on("callPeer", (data) => {
        console.log("calling peer");
        io.to(data.peerToCall).emit("calling", {
            signal: data.signalData,
            from: data.from,
        });
    });

    socket.on("acceptCall", (data) => {
        console.log("Call accepted by receiver");
        io.to(data.to).emit("callAccepted", data.signal);
    });

    socket.on("link", (data) => {
        io.to(clients[socket.id].peer_socket_id).emit("link", data);
    });

    socket.on("disconnect", () => {
        console.log("Client disconnected:", socket.id);
        if (clients[socket.id]) {
            io.to(clients[socket.id].peer_socket_id).emit("peerDisconnected");
            setTimeout(() => {
                delete clients[socket.id];
                console.log(clients);
            }, 200);
        }
    });
});

// listener
httpsServer.listen(process.env.PORT || 4000, () => {
    console.log(`HTTPS server listening on port ${PORT}`);
});