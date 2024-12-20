import { prisma } from "#helpers/prismaClient";
import { StatusCodes } from "http-status-codes";
import { OrdersApiError } from "./error";
import { ERROR_CODES } from "#constants";
import { ORDER_STATUS } from "#constants/order-status.constants";

class Orders {
  /**
   * @description Create an order. supports multiple items in a single order
   * @param {string} userId : user id
   * @param data: array of items
   */
  async create(userId: string, data: { items: { itemId: string, quantity: number }[] }) {
    const itemQuantities = data.items.reduce((acc, item) => {
      acc[item.itemId] = item.quantity;
      return acc;
    }, {});

    // Create order and its side effects
    const orderDetails = await prisma.$transaction(async tx => {
      // Check if all items are valid
      const itemsData = await Promise.all(data.items.map(async item => {
        const itemData = await tx.items.findUnique({
          where: { id: item.itemId, status: "ACTIVE" }
        });

        if (!itemData) {
          throw new OrdersApiError("Item not found", StatusCodes.NOT_FOUND, ERROR_CODES.NOT_ALLOWED);
        }

        if (itemData.quantity < item.quantity) {
          throw new OrdersApiError(`Only ${itemData.quantity} ${itemData.name} are in stock`, StatusCodes.BAD_REQUEST, ERROR_CODES.NOT_ALLOWED);
        }

        return itemData;
      }));

      const order = await tx.orders.create({
        data: {
          user_id: userId,
          total_price: itemsData.reduce((acc: number, item) => {
            acc += Number(item.price) * itemQuantities[item.id];
            return acc;
          }, 0),
          status: ORDER_STATUS.CONFIRMED
        }
      });

      // Update stock
      // TODO: check for OUT_OF_STOCK status. It can be done via triggers in the database
      for (const item of data.items) {
        await tx.items.update({
          where: { id: item.itemId },
          data: {
            quantity: {
              decrement: item.quantity
            }
          }
        });
      }

      // insertion into data_order_items
      await tx.orderItems.createMany({
        data: itemsData.map(item => ({
          order_id: order.id,
          item_id: item.id,
          quantity: itemQuantities[item.id],
          price: item.price
        }))
      });

      return order;
    })

    return orderDetails;
  }
}

export const orders = new Orders();