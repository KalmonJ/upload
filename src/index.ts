import express from "express";
import multer from "multer";
import path from "path";
import cloudinary from "cloudinary";
import dotenv from "dotenv";
import sqlite from "sqlite3";
import { unlink } from "fs/promises";

dotenv.config();

let sqlite3 = sqlite.verbose();
let db = new sqlite3.Database("./files.db", sqlite3.OPEN_READWRITE, (err) => {
  if (err) {
    console.log("Error to connect to db");
  }

  console.log("Database connection successfully");
});

db.run(
  "CREATE TABLE IF NOT EXISTS files (url text, original_file_name text, public_id text);",
  (err) => {
    if (err) {
      console.log("Erro ao criar tabela");
    }
  }
);

const cloud = cloudinary.v2;

cloud.config({
  api_secret: process.env.CLOUD_API_SECRET ?? "",
  api_key: process.env.CLOUD_API_KEY ?? "",
  cloud_name: process.env.CLOUD_NAME ?? "",
});

const app = express();

const storage = multer.diskStorage({
  destination(_, __, callback) {
    callback(null, path.join(__dirname, "../", "/tmp"));
  },
  filename(_, file, callback) {
    callback(null, file.originalname);
  },
});

const upload = multer({
  storage,
});

app.post("/upload", upload.array("files", 6), async (req, res) => {
  const files = req.files as Express.Multer.File[];
  if (!files)
    return res.status(400).send({ data: null, error: "No files provided" });

  try {
    const uploadedFiles = await Promise.all(
      files.map(async (file) => {
        const res = await cloud.uploader.upload(file.path, {
          overwrite: true,
          unique_filename: false,
          use_filename: true,
        });

        await unlink(file.path);

        return {
          url: res.url,
          original_file_name: res.original_filename,
          public_id: res.public_id,
        };
      })
    );

    uploadedFiles.forEach((file) => {
      console.log(file);
      db.run(
        `INSERT INTO files (url, original_file_name, public_id)
         VALUES('${file.url}', '${file.original_file_name}', '${file.public_id}');`,
        (err) => {
          if (err) console.log(err);
          console.log("success insert");
        }
      );
    });

    res.status(200).send({ data: { success: true }, error: null });
  } catch (error: any) {
    return res.status(500).send({ data: null, error: error.message });
  }
});

app.delete("/upload/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await cloud.uploader.destroy(id);
    db.run(
      `DELETE FROM files  
       WHERE public_id = '${id}';`,
      (err) => {
        if (err) console.log(err);
        console.log("success delete");
      }
    );

    return res.status(200).send({ data: { success: true }, error: null });
  } catch (error) {
    return res.status(500).send({ data: null, error });
  }
});

app.get("/files", async (_, res) => {
  try {
    const files: any[] = [];

    await new Promise((resolve) => {
      db.all(
        `SELECT * FROM files ORDER BY original_file_name;`,
        [],
        (err, rows) => {
          if (err) console.log(err);
          rows.forEach((row: any) => {
            console.log(row, "aquiii");
            files.push(row);
          });

          if (files.length === rows.length) {
            resolve("");
          }
        }
      );
    });

    return res.status(200).send({ data: files, error: null });
  } catch (error) {
    return res.status(500).send({ data: null, error });
  }
});

app.listen(3030, () => {
  console.log("app listen on http://localhost:3030");
});
