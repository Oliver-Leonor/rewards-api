import { Router } from "express";
import { getUserById, listUsers, createUser } from "../db/queries-users.js";
import { validate } from "../middleware/validate.js";
import { createUserSchema } from "../lib/validators.js";
import { generateId, ok, fail } from "../lib/utils.js";

export const usersRouter = Router();

// GET /api/users
usersRouter.get("/", async (_req, res) => {
  const users = await listUsers();
  res.json(ok(users));
});

// GET /api/users/:id
usersRouter.get("/:id", async (req, res) => {
  const id = req.params.id as string;
  const user = await getUserById(id);

  if (!user) {
    res.status(404).json(fail("User not found"));
    return;
  }

  res.json(ok(user));
});

// POST /api/users
usersRouter.post("/", validate(createUserSchema), async (req, res) => {
  const { name, email } = req.body;
  const id = generateId("usr");
  const user = await createUser(id, name, email);
  res.status(201).json(ok(user));
});
