const express = require("express");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 3000;
require("dotenv").config();

// middle were
app.use(cors());
app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.6zoig.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
const parcelsCollections = client.db("Parcels").collection("SendParcels");

async function run() {
  try {
    app.post("/parcels", async (req, res) => {
      try {
        const data = req.body;
        const result = await parcelsCollections.insertOne(data);
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: "not found", error: err });
      }
    });
    // app.get("/parcels", async (req, res) => {
    //   const result = await parcelsCollections.find().toArray();
    //   res.send(result);
    // });
    app.get("/parcels", async (req, res) => {
      const email = req.query.email;
      // const query = email ? { created_by: email } : {};
      const query = { created_by: email };
      const option = {
        sort: {
          creation_date: -1,
        },
      };
      const result = await parcelsCollections.find(query, option).toArray();
      res.send(result);
    });
    app.delete("/parcels/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await parcelsCollections.deleteOne(query);
        res.send(result);
      } catch (err) {
        res
          .status(500)
          .send({ message: "Failed to delete", error: err.message });
      }
    });
    // deploy to comment this
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", async (req, res) => {
  res.send("server is running");
});

app.listen(port, () => {
  console.log(` app listening on port ${port}`);
});
