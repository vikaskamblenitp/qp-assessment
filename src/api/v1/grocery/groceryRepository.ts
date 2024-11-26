import { ERROR_CODES, GROCERY_ITEM_STATUS } from "#constants";
import { prisma } from "#helpers/prismaClient";
import { data_items as GroceryItem, Prisma } from "@prisma/client";
import { GroceryItemApiError } from "./error";
import { StatusCodes } from "http-status-codes";
import { buildPrismaQuery } from "#utils/prismaQueryBuilder";


export class GroceryRepository {
  findAll(payload) {
    console.log(payload);

    const queryOptions = buildPrismaQuery<
      Prisma.data_itemsWhereInput,
      keyof Prisma.data_itemsOrderByWithRelationInput
    >(payload);
    
    return prisma.data_items.findMany({
      where: queryOptions.where,
      take: queryOptions.take,
      skip: queryOptions.skip,
      orderBy: queryOptions.orderBy as Prisma.data_itemsOrderByWithRelationInput,
    });
  }

  async findById(id: string) {
    const item = await prisma.data_items.findUnique({ where: { id } });

    if (!item) throw new GroceryItemApiError(`Item with ID ${id} not found`, StatusCodes.NOT_FOUND, ERROR_CODES.NOT_FOUND);

    return item;
  }

  create(data: Omit<GroceryItem, "created_at" | "updated_at">) {
    return prisma.data_items.create({ data });
  }

  update(id: string, data: Partial<GroceryItem>) {
    return prisma.data_items.update({ where: { id }, data });
  }

  delete(id: string) {
    return prisma.data_items.delete({ where: { id } });
  }

  updateStatus(id: string, status: GroceryItem["status"]) {
    return prisma.data_items.update({ where: { id }, data: { status } });
  }

  updateStock(id: string, quantityPayload: { increment?: number; decrement?: number }) {
    if(Object.keys(quantityPayload).length > 1) {
      throw new Error("Can't perform both increment & decrement on one item")
    }
    return prisma.$transaction(async (tx) => {
      const updatedItem = await prisma.data_items.update({
        where: { id },
        data: { quantity: {...quantityPayload.increment ? { increment: quantityPayload.increment } : { decrement: quantityPayload.decrement} } }
      });

      if (updatedItem.quantity === 0) {
        await tx.data_items.update({
          where: { id },
          data: { status: GROCERY_ITEM_STATUS.OUT_OF_STOCK as GroceryItem["status"] }
        });
      }
    });
  }

  async getStock(id: string) {
    const item = await prisma.data_items.findUnique({ where: { id }, select: { quantity: true } });
    if (!item) throw new GroceryItemApiError(`Item with ID ${id} not found`, StatusCodes.NOT_FOUND, ERROR_CODES.NOT_FOUND);
    return item.quantity;
  }
}
