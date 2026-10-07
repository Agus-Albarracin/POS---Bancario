import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { getDatabaseConfig } from "./database.config.js";

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  readonly client = new PrismaClient({
    adapter: new PrismaPg(getDatabaseConfig(), {
      onPoolError: () => {
        this.logger.error("Se perdió una conexión inactiva con PostgreSQL.");
      },
    }),
    errorFormat: "minimal",
  });

  async onModuleInit(): Promise<void> {
    try {
      await this.client.$connect();
    } catch {
      await this.client.$disconnect();
      throw new Error(
        "No se pudo conectar con PostgreSQL. Revisa el contenedor y DB_*.",
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
